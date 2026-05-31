import os
import shutil
import time
from pathlib import Path
from typing import Any, Dict, List, Optional
from django.utils import timezone as dj_tz
from .utils import _cfg, emit
from .navidrome import _get_playlist_track_map, _sync_navidrome_metadata, _delete_from_navidrome_db

def get_storage_info() -> Dict[str, Any]:
    cfg = _cfg()
    folder = Path(cfg["TEMP_FOLDER"])
    used = sum(f.stat().st_size for f in folder.rglob("*") if f.is_file()) if folder.exists() else 0
    total = int(cfg.get("MAX_STORAGE_SIZE", 10)) * (1024**3)
    return {
        "used_bytes": used, 
        "total_bytes": total, 
        "percent": round(used/total*100, 1) if total else 0, 
        "used_gb": round(used/1024**3, 2), 
        "total_gb": round(total/1024**3, 2)
    }

def storage_is_full() -> bool:
    i = get_storage_info()
    return i["used_bytes"] >= i["total_bytes"]

def purge_oldest_songs(job: Optional[Any] = None) -> None:
    from ..models import Song
    cfg = _cfg()
    temp = Path(cfg["TEMP_FOLDER"])
    perm = Path(cfg["PERMANENT_SAVING_DIR"])
    perm.mkdir(parents=True, exist_ok=True)
    
    audio_exts = {".mp3", ".flac", ".m4a", ".opus", ".ogg", ".webm"}
    files = sorted([f for f in temp.rglob("*") if f.suffix.lower() in audio_exts], key=lambda f: f.stat().st_mtime)
    if not files:
        return
    
    m_str = str(cfg.get("MONITORED_PLAYLISTS", "")).strip()
    pl_map = _get_playlist_track_map()
    m_list = [p.strip() for p in m_str.split(",") if p.strip()]
    hold_days = int(cfg.get("HOLD_PERIOD_DAYS", 30))
    quota = int(cfg.get("MAX_DELETE_PER_PURGE", 100))
    hold_sec = hold_days * 86400
    now = time.time()
    deleted = 0
    
    emit(f"Purge Analysis: Checking {len(files)} files...", job=job)
    for f in files:
        if deleted >= quota:
            break
        
        matched_pls = pl_map.get(f.name, set())
        
        is_protected = False
        if m_list:
            if any(pl in m_list for pl in matched_pls): is_protected = True
        else:
            if any(pl != 'latest' for pl in matched_pls): is_protected = True

        db_s = Song.objects.filter(filename=f.name).first()
        
        if is_protected:
            if db_s and not db_s.needs_tagging and not db_s.pending_confirmation:
                new_p = perm / f.name
                try: 
                    old_p_str, new_p_str = str(f), str(new_p)
                    if not new_p.exists():
                        shutil.move(old_p_str, new_p_str)
                        _sync_navidrome_metadata(old_p_str, new_p_str, {'title':db_s.title,'artist':db_s.artist,'album':db_s.album,'album_artist':db_s.album_artist})
                        emit(f"Archived protected song: {f.name}", job=job)
                    if db_s: 
                        db_s.status = 'moved'
                        db_s.filepath = new_p_str
                        db_s.save()
                except Exception as e:
                    emit(f"Archive error: {e}", level="error", job=job)
            continue
            
        if (now - f.stat().st_mtime) > hold_sec:
            emit(f"Deleting: {f.name}", job=job, event_type="purge_delete")
            f.unlink(missing_ok=True)
            f.with_suffix(".info.json").unlink(missing_ok=True)
            _delete_from_navidrome_db(f)
            if db_s:
                db_s.status = "deleted"
                db_s.deleted_at = dj_tz.now()
                db_s.save()
            deleted += 1
            
    emit(f"Purge complete. {deleted} files removed.", job=job)

def get_upcoming_purges(candidates_page: int = 1, protected_page: int = 1, page_size: int = 50) -> Dict[str, Any]:
    from ..models import Song
    cfg = _cfg()
    temp = Path(cfg["TEMP_FOLDER"])
    audio_exts = {".mp3", ".flac", ".m4a", ".opus", ".ogg", ".webm"}
    empty = {
        "candidates": [], "protected": [],
        "candidates_total": 0, "protected_total": 0,
        "candidates_page": candidates_page, "protected_page": protected_page,
        "page_size": page_size,
        "debug_info": {"monitored_playlists": "", "total_playlist_tracks": 0}
    }
    if not temp.exists():
        return empty

    files = sorted([f for f in temp.rglob("*") if f.suffix.lower() in audio_exts], key=lambda f: f.stat().st_mtime)
    m_str = str(cfg.get("MONITORED_PLAYLISTS", "")).strip()
    pl_map = _get_playlist_track_map()
    m_list = [p.strip() for p in m_str.split(",") if p.strip()]
    hold_days = int(cfg.get("HOLD_PERIOD_DAYS", 30))
    hold_sec = hold_days * 86400
    now = time.time()

    candidates: list[dict[str, Any]] = []
    protected: list[dict[str, Any]] = []
    for f in files:
        matched_pls = pl_map.get(f.name, set())
        is_protected = False
        if m_list:
            if any(pl in m_list for pl in matched_pls): is_protected = True
        else:
            if any(pl != 'latest' for pl in matched_pls): is_protected = True

        db_s = Song.objects.filter(filename=f.name).first()
        if is_protected:
            protected.append({
                "filename": f.name,
                "playlists": list(matched_pls),
                "match_reason": "Ready to Archive" if (db_s and not db_s.needs_tagging) else "Protected but Untagged"
            })
            continue
        if (now - f.stat().st_mtime) > hold_sec:
            candidates.append({"filename": f.name, "mtime": f.stat().st_mtime})

    if page_size < 1:
        page_size = 50

    c_start = (max(1, candidates_page) - 1) * page_size
    p_start = (max(1, protected_page) - 1) * page_size

    return {
        "candidates": candidates[c_start:c_start + page_size],
        "protected": protected[p_start:p_start + page_size],
        "candidates_total": len(candidates),
        "protected_total": len(protected),
        "candidates_page": candidates_page,
        "protected_page": protected_page,
        "page_size": page_size,
        "debug_info": {
            "monitored_playlists": m_str or "All except 'latest'",
            "total_playlist_tracks": len(pl_map)
        }
    }

def cleanup_deleted_history(days_override: Optional[int] = None) -> int:
    from ..models import Song
    from datetime import timedelta
    cfg = _cfg()
    d = days_override if days_override is not None else int(cfg.get("HOLD_PERIOD_DAYS", 30))
    cutoff = dj_tz.now() - timedelta(days=d)
    recs = Song.objects.filter(status="deleted", deleted_at__lt=cutoff)
    count = recs.count()
    recs.delete()
    return count
