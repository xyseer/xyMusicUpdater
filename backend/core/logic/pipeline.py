import difflib
from pathlib import Path
from typing import Any, List, Optional
from django.utils import timezone as dj_tz
from .utils import _cfg, emit, _normalize_for_match, _clean_query, _score_title_match
from .ytdlp import _ytdlp_download, _is_duplicate
from .navidrome import navidrome_rescan
from .storage import purge_oldest_songs

def fetch_all_sources(job: Optional[Any] = None) -> List[Path]:
    cfg = _cfg()
    sources = eval(cfg["SOURCES"]) if isinstance(cfg["SOURCES"], str) else cfg["SOURCES"]
    temp = Path(cfg["TEMP_FOLDER"])
    temp.mkdir(parents=True, exist_ok=True)
    all_files = []
    limit = int(cfg.get("MAX_SONGS_PER_SOURCE", 10))
    for label, urls in sources.items():
        emit(f"Source: {label}", job=job)
        for url in urls:
            all_files.extend(_ytdlp_download(url, temp, label, max_items=limit, job=job))
    return all_files

def register_songs(files: List[Path], source: str = "", job: Optional[Any] = None) -> List[Any]:
    from ..models import Song
    from .tagger import _read_basic_tags, search_musicbrainz_api, fingerprint_match
    added = []
    for f in files:
        if not f.exists():
            continue
        
        # Read Video ID from sidecar if it exists
        video_id = ""
        vid_file = Path(str(f) + ".vid")
        if vid_file.exists():
            try:
                video_id = vid_file.read_text(encoding="utf-8").strip()
                vid_file.unlink()
            except Exception:
                pass

        t, a, al, aa = _read_basic_tags(f)
        raw_query = t if t else f.stem
        needs_tagging, query_term, pending_conf = True, raw_query, False

        # ── Stage 1: AcoustID audio fingerprinting (most accurate) ──────────
        fp = fingerprint_match(f)
        if fp and fp.get("title"):
            t, a, al, aa = fp['title'], fp['artist'], fp['album'], fp['album_artist']
            needs_tagging, pending_conf = False, True
            emit(f"Fingerprint Match (score={fp.get('score', 0):.2f}): {t}", job=job)

        # ── Stage 2: Text search fallback (iTunes + MusicBrainz) ────────────
        elif raw_query:
            clean_q = _clean_query(raw_query)
            match = search_musicbrainz_api(clean_q or raw_query, limit=3)
            if match:
                best, best_score = None, 0.0
                for res in match:
                    score = _score_title_match(raw_query, res.get('title') or '')
                    if score > best_score:
                        best_score, best = score, res
                if best and best_score >= 0.65:
                    if not best.get("album"): best["album"] = best["title"]
                    if not best.get("album_artist"): best["album_artist"] = best.get("artist")
                    t, a, al, aa, needs_tagging, pending_conf = best['title'], best['artist'], best['album'], best['album_artist'], False, True
                    emit(f"Text Match (score={best_score:.2f}): {t}", job=job)
        
        song, created = Song.objects.get_or_create(
            filename=f.name, 
            defaults={
                "filepath": str(f), 
                "video_id": video_id,
                "title": t, 
                "artist": a, 
                "album": al, 
                "source": source, 
                "file_size": f.stat().st_size, 
                "status": "active", 
                "needs_tagging": needs_tagging, 
                "pending_confirmation": pending_conf
            }
        )
        if not created: 
            song.status, song.title, song.artist, song.needs_tagging, song.pending_confirmation = "active", t, a, needs_tagging, pending_conf
            if video_id: song.video_id = video_id
            song.save()
        if job:
            job.songs_added.add(song)
        added.append(song)
    return added

def run_pipeline(job: Optional[Any] = None) -> None:
    from ..models import DownloadJob
    if not job:
        job = DownloadJob.objects.create(job_type="cron", status="running")
    emit("Scheduled Pipeline Started", job=job)
    files = fetch_all_sources(job=job)
    if files: 
        register_songs(files, source="cron", job=job)
        navidrome_rescan(job=job, full_scan=True)
    purge_oldest_songs(job=job)
    job.status="done"
    job.finished_at = dj_tz.now()
    job.save()
    emit("Scheduled Pipeline Complete ✓", job=job)

def retry_interrupted_jobs() -> None:
    from ..models import DownloadJob
    DownloadJob.objects.filter(status="running").update(status="failed", error="Interrupted")
