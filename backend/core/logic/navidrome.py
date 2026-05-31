import hashlib
import os
import secrets
import sqlite3
import requests
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import unquote
from .utils import _cfg, emit

def _get_playlist_track_map() -> Dict[str, Any]:
    track_map: dict[str, Any] = {}
    db_path = "/navidrome_data/navidrome.db"
    if not os.path.exists(db_path):
        return track_map
    try:
        with sqlite3.connect(db_path, timeout=20) as conn:
            cursor = conn.cursor()
            # 1. Get tracks from playlists (excluding 'latest')
            query_pl = "SELECT p.name, mf.path FROM playlist p JOIN playlist_tracks pt ON p.id = pt.playlist_id JOIN media_file mf ON pt.media_file_id = mf.id WHERE p.name != 'latest';"
            cursor.execute(query_pl)
            for pl_name, raw_path in cursor.fetchall():
                fname = os.path.basename(unquote(raw_path))
                if fname not in track_map:
                    track_map[fname] = set()
                track_map[fname].add(pl_name)
            
            # 2. Get favorited (starred) tracks
            query_fav = "SELECT mf.path FROM annotation a JOIN media_file mf ON a.item_id = mf.id WHERE a.item_type = 'media_file' AND a.starred = 1;"
            cursor.execute(query_fav)
            for (raw_path,) in cursor.fetchall():
                fname = os.path.basename(unquote(raw_path))
                if fname not in track_map:
                    track_map[fname] = set()
                track_map[fname].add("Favorites")
    except Exception as e:
        emit(f"Playlist map error: {e}", level="warning")
    return track_map

def _sync_navidrome_metadata(old_path_str: str, new_path_str: str, tags: Dict[str, Any]) -> None:
    db_path = "/navidrome_data/navidrome.db"
    if not os.path.exists(db_path):
        return
    try:
        old_rel, new_rel = old_path_str.replace("/music/", ""), new_path_str.replace("/music/", "")
        with sqlite3.connect(db_path, timeout=30) as conn:
            cursor = conn.cursor()
            cursor.execute("UPDATE media_file SET path=?, title=?, artist=?, album=?, album_artist=?, updated_at=CURRENT_TIMESTAMP, missing=0 WHERE path=? OR path LIKE ?", 
                           (new_rel, tags.get('title',''), tags.get('artist',''), tags.get('album',''), tags.get('album_artist',''), old_rel, f"%{os.path.basename(old_path_str)}"))
            conn.commit()
    except Exception:
        pass

def _write_latest_m3u() -> None:
    cfg = _cfg()
    m3u = Path(cfg["TEMP_FOLDER"]) / "latest.m3u"
    lines = ["#EXTM3U"]

    # Primary: Navidrome DB — reflects full library regardless of download source
    db_path = "/navidrome_data/navidrome.db"
    if os.path.exists(db_path):
        try:
            with sqlite3.connect(db_path, timeout=10) as conn:
                cursor = conn.cursor()
                cursor.execute(
                    "SELECT path FROM media_file WHERE missing=0 ORDER BY created_at DESC LIMIT 100"
                )
                for (raw_path,) in cursor.fetchall():
                    decoded = unquote(raw_path)
                    lines.append(f"/music/{decoded}" if not decoded.startswith("/") else decoded)
        except Exception as e:
            emit(f"latest.m3u: Navidrome DB error: {e}", level="warning")

    # Fallback: Django Song table (Navidrome DB not mounted)
    if len(lines) == 1:
        from ..models import Song
        for s in Song.objects.exclude(status="deleted").order_by("-created_at")[:100]:
            lines.append(str(s.filepath))

    try:
        m3u.write_text("\n".join(lines) + "\n", encoding="utf-8")
    except Exception as e:
        emit(f"Failed to write latest.m3u: {e}", level="warning")

def navidrome_rescan(job: Optional[Any] = None, full_scan: bool = False) -> bool:
    import threading
    def _task():
        # 1. Update the M3U file IMMEDIATELY (local, fast)
        _write_latest_m3u()

        cfg = _cfg()
        base = cfg["NAVIDROME_URL"].rstrip("/")
        user = cfg["NAVIDROME_USER"]
        passwd = cfg["NAVIDROME_PASSWORD"]
        
        # 2. Trigger rescan
        salt = secrets.token_hex(3)
        token = hashlib.md5(f"{passwd}{salt}".encode()).hexdigest()
        p = {"u": user, "t": token, "s": salt, "v": "1.16.1", "c": "NDM", "f": "json"}
        if full_scan:
            p["fullScan"] = "true"

        try: 
            # Navidrome's API typically requires .view suffix for Subsonic endpoints
            r = requests.get(f"{base}/rest/startScan.view", params=p, timeout=10)
            if r.status_code == 200:
                scan_type = "full" if full_scan else "incremental"
                emit(f"Navidrome {scan_type} scan triggered", job=job)
            else:
                emit(f"Navidrome scan failed with status {r.status_code}", level="error", job=job)
        except Exception as e:
            emit(f"Navidrome scan request error: {e}", level="error", job=job)

        # 3. Optional cleanup (non-blocking)
        try:
            ra = requests.post(f"{base}/auth/login", json={"username": user, "password": passwd}, timeout=10)
            if ra.status_code == 200:
                tk = ra.json().get("token")
                requests.delete(f"{base}/api/missing", headers={"x-nd-authorization": f"Bearer {tk}"}, timeout=10)
        except Exception:
            pass
            
    if job:
        _task()
    else:
        threading.Thread(target=_task, daemon=True).start()
    return True

def _delete_from_navidrome_db(file_path: Path) -> None:
    db_path = "/navidrome_data/navidrome.db"
    if not os.path.exists(db_path):
        return
    try:
        with sqlite3.connect(db_path, timeout=10) as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM media_file WHERE path = ? OR path LIKE ?", (str(file_path).replace("/music/",""), f"%{file_path.name}"))
            conn.commit()
    except Exception:
        pass

def get_navidrome_playlists() -> List[Dict[str, Any]]:
    cfg = _cfg()
    base = cfg["NAVIDROME_URL"].rstrip("/")
    passwd = cfg["NAVIDROME_PASSWORD"]
    s = secrets.token_hex(6)
    tk = hashlib.md5(f"{passwd}{s}".encode()).hexdigest()
    p = {"u": cfg["NAVIDROME_USER"], "t": tk, "s": s, "v": "1.16.1", "c": "NDM", "f": "json"}
    try:
        r = requests.get(f"{base}/rest/getPlaylists", params=p, timeout=10)
        playlists = [{"id": x.get("id"), "name": x.get("name"), "songCount": x.get("songCount")} for x in r.json().get("subsonic-response",{}).get("playlists",{}).get("playlist",[])]
        
        # Add virtual 'Favorites' playlist
        db_path = "/navidrome_data/navidrome.db"
        if os.path.exists(db_path):
            with sqlite3.connect(db_path, timeout=5) as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT count(*) FROM annotation WHERE starred = 1 AND item_type = 'media_file'")
                fav_count = cursor.fetchone()[0]
                if fav_count > 0:
                    playlists.append({"id": "virtual_favorites", "name": "Favorites", "songCount": fav_count})
        
        return playlists
    except Exception:
        return []
