"""
music_engine.py
All music-related logic: fetch, tag, rescan, purge, sse, discovery.
"""
import hashlib
import json
import os
import re
import secrets
import subprocess
import time
import requests
import shutil
import threading
import sqlite3
import difflib
from pathlib import Path
from datetime import timedelta
from urllib.parse import unquote
from django.utils import timezone as dj_tz

# ── SSE Logging & Messaging ───────────────────────────────────────────────

_sse_listeners = []
_sse_lock = threading.Lock()

def register_sse_listener(q):
    with _sse_lock:
        if q not in _sse_listeners: _sse_listeners.append(q)

def unregister_sse_listener(q):
    with _sse_lock:
        if q in _sse_listeners: _sse_listeners.remove(q)

def emit(msg, job=None, level="info", event_type="log"):
    from .models import ActivityLog
    print(f"[{level.upper()}] {msg}")
    now_iso = dj_tz.now().isoformat()
    if job:
        try: ActivityLog.objects.create(job=job, message=msg, level=level)
        except Exception: pass
    _broadcast({"type": event_type, "message": msg, "level": level, "ts": now_iso})

def _broadcast(data):
    msg = json.dumps(data)
    with _sse_lock:
        cur = list(_sse_listeners)
    for q in cur:
        try: q.put_nowait(msg)
        except Exception: unregister_sse_listener(q)

# ── Configuration & Helpers ───────────────────────────────────────────────

def _cfg():
    from django.conf import settings
    from .models import SystemConfig
    base_cfg = settings.MUSIC_CONFIG.copy()
    try:
        for item in SystemConfig.objects.all(): base_cfg[item.key] = item.value
    except Exception: pass
    return base_cfg

def _sanitize_filename(name: str) -> str:
    s = re.sub(r'[\\/*?:"<>|]', " ", name)
    s = re.sub(r'\s+', " ", s).strip()
    return s

def _normalize_for_match(s: str) -> str:
    if not s: return ""
    # Remove extensions from normalization key to avoid collision
    base = os.path.splitext(s.lower())[0]
    return re.sub(r'[^a-z0-9]', '', base)

def _is_duplicate(title: str, uploader: str = "") -> bool:
    from .models import Song
    import sqlite3
    if not title: return False
    
    t_lower = title.lower()
    u_lower = uploader.lower() if uploader else ""
    norm = _normalize_for_match(title)
    
    existing_songs = Song.objects.filter(status__in=['active', 'moved'])
    for song in existing_songs:
        db_t, db_a = song.title, song.artist
        if not db_t: continue
        db_t_lower = db_t.lower()
        db_a_lower = db_a.lower() if db_a else ""
        
        if u_lower and db_a_lower:
            if db_t_lower == t_lower and db_a_lower == u_lower: return True
            
        if db_a_lower and len(db_a_lower) > 1 and len(db_t_lower) > 1:
            if db_t_lower in t_lower and db_a_lower in t_lower: return True
            
        if not db_a_lower:
            if db_t_lower == t_lower: return True
            if norm and _normalize_for_match(db_t) == norm: return True
        
    db_path = "/navidrome_data/navidrome.db"
    if os.path.exists(db_path):
        try:
            with sqlite3.connect(db_path, timeout=10) as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT title, artist FROM media_file WHERE missing=0")
                for nd_t, nd_a in cursor.fetchall():
                    if not nd_t: continue
                    nd_t_lower = nd_t.lower()
                    nd_a_lower = nd_a.lower() if nd_a else ""
                    
                    if u_lower and nd_a_lower:
                        if nd_t_lower == t_lower and nd_a_lower == u_lower: return True
                        
                    if nd_a_lower and len(nd_a_lower) > 1 and len(nd_t_lower) > 1:
                        if nd_a_lower in t_lower and nd_t_lower in t_lower: return True
                        
                    if not nd_a_lower:
                        if nd_t_lower == t_lower: return True
                        if norm and _normalize_for_match(nd_t) == norm: return True
        except Exception:
            pass
            
    return False

# ── Fetching Logic ────────────────────────────────────────────────────────

def fetch_all_sources(job=None):
    cfg = _cfg(); sources = eval(cfg["SOURCES"]) if isinstance(cfg["SOURCES"], str) else cfg["SOURCES"]
    temp = Path(cfg["TEMP_FOLDER"]); temp.mkdir(parents=True, exist_ok=True)
    all_files = []; limit = int(cfg.get("MAX_SONGS_PER_SOURCE", 10))
    for label, urls in sources.items():
        emit(f"Source: {label}", job=job)
        for url in urls: all_files.extend(_ytdlp_download(url, temp, label, max_items=limit, job=job))
    return all_files

def download_url(url: str, job=None, allow_playlist: bool = False, override_duplicate: bool = False) -> list[Path]:
    cfg = _cfg(); temp = Path(cfg["TEMP_FOLDER"]); temp.mkdir(parents=True, exist_ok=True)
    limit = int(cfg.get("MAX_SONGS_PER_SOURCE", 100))
    if not job:
        from .models import DownloadJob
        job = DownloadJob.objects.create(job_type="manual", status="running", url=url)
    emit(f"Starting Download: {url}", job=job)
    files = _ytdlp_download(url, temp, "manual", max_items=limit, job=job, allow_playlist=allow_playlist, override_duplicate=override_duplicate)
    job.status = "done"; job.finished_at = dj_tz.now(); job.save()
    emit(f"Download Finished. {len(files)} files obtained.", job=job)
    return files

def _sanitize_ytdlp_out(text, cfg):
    if not text: return ""
    s = text
    if cfg.get("YTDLP_PASSWORD"):
        s = s.replace(cfg["YTDLP_PASSWORD"], "********")
    
    # Mask any potential cookie content
    cookies = cfg.get("YTDLP_COOKIES", "")
    if cookies:
        # Mask header-style cookies
        if "=" in cookies and ";" in cookies:
            for part in cookies.split(";"):
                if "=" in part:
                    _, val = part.split("=", 1)
                    val = val.strip()
                    if len(val) > 5: s = s.replace(val, "********")
        # Mask Netscape-style cookies
        for line in cookies.splitlines():
            parts = line.split("\t")
            if len(parts) > 6:
                val = parts[6].strip()
                if len(val) > 5: s = s.replace(val, "********")
    return s

def _ytdlp_download(url, dest, label, max_items=10, job=None, allow_playlist=True, override_duplicate=False):
    emit(f"Analyzing source: {url}", job=job)
    cfg = _cfg()
    cmd_meta = ["yt-dlp", "--js-runtimes", "node", "--remote-components", "ejs:github", "--flat-playlist", "--dump-json", "--playlist-end", str(max_items)]
    
    cookies_raw = cfg.get("YTDLP_COOKIES", "").strip()
    cookies_file = None
    
    if cookies_raw:
        cookies_file = Path(cfg["TEMP_FOLDER"]) / "ytdlp_cookies.txt"
        try:
            if cookies_raw.startswith("# Netscape") or "\t" in cookies_raw:
                # Already Netscape
                cookies_file.write_text(cookies_raw + "\n", encoding="utf-8")
            else:
                # Convert Header Cookie to Netscape for better security/compatibility
                # Format: domain  TRUE  path  FALSE  expiry  name  value
                header_val = cookies_raw
                if header_val.lower().startswith("cookie:"):
                    header_val = header_val[7:].strip()
                
                lines = ["# Netscape HTTP Cookie File"]
                # For YouTube Music/YouTube, we scope to .google.com or .youtube.com
                domain = ".youtube.com"
                if "music.youtube.com" in url: domain = ".youtube.com"
                elif "google.com" in url: domain = ".google.com"
                
                for part in header_val.split(";"):
                    if "=" in part:
                        name, val = part.strip().split("=", 1)
                        # domain  TRUE  path  FALSE  expiry  name  value
                        # Use 0 for expiry (session)
                        lines.append(f"{domain}\tTRUE\t/\tFALSE\t0\t{name}\t{val}")
                cookies_file.write_text("\n".join(lines) + "\n", encoding="utf-8")
            
            cmd_meta.extend(["--cookies", str(cookies_file)])
        except Exception as e:
            emit(f"Failed to write cookies file: {e}", level="warning", job=job)
    
    # Auth credentials
    if cfg.get("YTDLP_USERNAME"):
        cmd_meta.extend(["--username", cfg["YTDLP_USERNAME"]])
        if cfg.get("YTDLP_PASSWORD"):
            cmd_meta.extend(["--password", cfg["YTDLP_PASSWORD"]])
    
    if cfg.get("YTDLP_PROXY"):
        cmd_meta.extend(["--proxy", cfg["YTDLP_PROXY"]])

    if not allow_playlist: cmd_meta.append("--no-playlist")
    cmd_meta.append(url)
    targets = [] # List of (title, vid) tuples
    
    try:
        # We capture stderr separately to avoid mixing credentials if yt-dlp errors out with command dump
        result = subprocess.run(cmd_meta, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, errors="replace", timeout=120)
        out, err = result.stdout, result.stderr

        for line in out.splitlines():
            try:
                entry = json.loads(line)
                title, vid, uploader = entry.get("title"), entry.get("url") or entry.get("id"), entry.get("uploader", "")
                
                # SKIP channels/users/playlists to prevent yt-dlp from hanging on massive catalogs
                is_container = entry.get("_type") in ["url", "playlist"] and any(x in vid.lower() for x in ["/channel/", "/user/", "/@", "/playlist?list="])
                if is_container:
                    emit(f"Skip Container: {title}", job=job)
                    continue

                if vid and title:
                    if not override_duplicate and _is_duplicate(title, uploader): 
                        emit(f"Skip Duplicate: {title}", job=job)
                    else: 
                        targets.append((title, vid))
            except: continue
            
        # Log yt-dlp warnings/errors aggressively but sanitized
        combined = _sanitize_ytdlp_out(out + "\n" + err, cfg)
        if "ERROR:" in combined or "WARNING:" in combined:
            err_lines = [l for l in combined.splitlines() if "ERROR:" in l or "WARNING:" in l]
            if err_lines:
                msg = "\\n".join(err_lines[:3]) 
                emit(f"yt-dlp issue: {msg}", level="error" if "ERROR:" in combined else "warning", job=job)

        if not targets and not ("ERROR:" in combined):
            emit(f"Source analysis returned no valid targets.", level="warning", job=job)

    except Exception as e:
        emit(f"Metadata analysis failed: {e}", level="error", job=job)
        return []

    if not targets:
        emit("No new songs found or all are duplicates.", job=job)
        return []
    
    emit(f"Downloading {len(targets)} new items...", job=job)
    downloaded_files = []
    output_tpl = str(dest / f"%(title)s.%(ext)s")
    
    for title, vid in targets:
        emit(f"Downloading: {title}", job=job)
        cmd = ["yt-dlp", "--js-runtimes", "node", "--remote-components", "ejs:github", "--no-playlist", "-x", "--audio-format", "mp3", "--audio-quality", "0", "--no-mtime", "--no-overwrites", "--add-metadata", "--embed-thumbnail", "--output", output_tpl]
        
        if cookies_raw:
            if cookies_file and cookies_file.exists():
                cmd.extend(["--cookies", str(cookies_file)])
        
        if cfg.get("YTDLP_USERNAME"):
            cmd.extend(["--username", cfg["YTDLP_USERNAME"]])
            if cfg.get("YTDLP_PASSWORD"):
                cmd.extend(["--password", cfg["YTDLP_PASSWORD"]])
        
        if cfg.get("YTDLP_PROXY"):
            cmd.extend(["--proxy", cfg["YTDLP_PROXY"]])

        cmd.append(vid)
        before = set(dest.iterdir())
        try:
            res = subprocess.run(cmd, capture_output=True, text=True, errors="replace", timeout=600)
            if res.returncode != 0:
                err_msg = _sanitize_ytdlp_out(res.stderr, cfg)
                emit(f"Download failed for {title}: {err_msg}", level="error", job=job)
            else:
                downloaded_files.extend([f for f in (set(dest.iterdir()) - before) if f.suffix.lower() == ".mp3"])
        except Exception as e: 
            emit(f"yt-dlp execution failed for {title}: {e}", level="error", job=job)

    if cookies_file and cookies_file.exists():
        try: cookies_file.unlink()
        except: pass
    return downloaded_files

# ── Navidrome Integration ─────────────────────────────────────────────────

def _get_playlist_track_map() -> dict:
    track_map = {}
    db_path = "/navidrome_data/navidrome.db"
    if not os.path.exists(db_path): return track_map
    try:
        with sqlite3.connect(db_path, timeout=20) as conn:
            cursor = conn.cursor()
            query = "SELECT p.name, mf.path FROM playlist p JOIN playlist_tracks pt ON p.id = pt.playlist_id JOIN media_file mf ON pt.media_file_id = mf.id WHERE p.name != 'latest';"
            cursor.execute(query)
            for pl_name, raw_path in cursor.fetchall():
                fname = os.path.basename(unquote(raw_path))
                if fname not in track_map: track_map[fname] = set()
                track_map[fname].add(pl_name)
    except Exception as e:
        emit(f"Playlist map error: {e}", level="warning")
    return track_map

def _sync_navidrome_metadata(old_path_str: str, new_path_str: str, tags: dict):
    db_path = "/navidrome_data/navidrome.db"
    if not os.path.exists(db_path): return
    try:
        old_rel, new_rel = old_path_str.replace("/music/", ""), new_path_str.replace("/music/", "")
        with sqlite3.connect(db_path, timeout=30) as conn:
            cursor = conn.cursor()
            cursor.execute("UPDATE media_file SET path=?, title=?, artist=?, album=?, album_artist=?, updated_at=CURRENT_TIMESTAMP, missing=0 WHERE path=? OR path LIKE ?", 
                           (new_rel, tags.get('title',''), tags.get('artist',''), tags.get('album',''), tags.get('album_artist',''), old_rel, f"%{os.path.basename(old_path_str)}"))
            conn.commit()
    except Exception: pass

def navidrome_rescan(job=None) -> bool:
    import threading
    def _task():
        cfg = _cfg(); base = cfg["NAVIDROME_URL"].rstrip("/"); user = cfg["NAVIDROME_USER"]; passwd = cfg["NAVIDROME_PASSWORD"]
        
        # 1. Delete previously marked missing files FIRST
        try:
            ra = requests.post(f"{base}/auth/login", json={"username": user, "password": passwd}, timeout=10)
            if ra.status_code == 200:
                tk = ra.json().get("token")
                rd = requests.delete(f"{base}/api/missing", headers={"x-nd-authorization": f"Bearer {tk}"}, timeout=15)
                if rd.status_code != 200: emit(f"Failed to delete missing: {rd.text}", level="warning", job=job)
            else:
                emit(f"Navidrome Auth Failed. Check your password in Settings!", level="error", job=job)
        except Exception as e:
            emit(f"Navidrome missing cleanup error: {e}", level="warning", job=job)
            
        _write_latest_m3u()
        
        # 2. Trigger new scan (async)
        salt = secrets.token_hex(3); token = hashlib.md5(f"{passwd}{salt}".encode()).hexdigest()
        p = {"u": user, "t": token, "s": salt, "v": "1.16.1", "c": "NDM", "f": "json"}
        try: 
            r = requests.get(f"{base}/rest/startScan", params={"fullScan": "true", **p}, timeout=15)
            if r.status_code != 200 or r.json().get("subsonic-response", {}).get("status") == "failed":
                emit(f"Navidrome scan failed. Check password. ({r.text})", level="error", job=job)
            else:
                emit("Navidrome rescan triggered", job=job)
        except Exception as e:
            emit(f"Navidrome scan error: {e}", level="error", job=job)
            
    if job: _task()
    else: threading.Thread(target=_task, daemon=True).start()
    return True

def _write_latest_m3u():
    from .models import Song
    cfg = _cfg(); m3u = Path(cfg["TEMP_FOLDER"]) / "latest.m3u"
    latest = Song.objects.filter(status="active").order_by("-created_at")[:100]
    try: m3u.write_text("#EXTM3U\n" + "\n".join([str(s.filepath) for s in latest]) + "\n", encoding="utf-8")
    except Exception as e: emit(f"Failed to write latest.m3u: {e}", level="warning")

# ── Storage Helpers ───────────────────────────────────────────────────────

def get_storage_info():
    cfg = _cfg(); folder = Path(cfg["TEMP_FOLDER"])
    used = sum(f.stat().st_size for f in folder.rglob("*") if f.is_file()) if folder.exists() else 0
    total = int(cfg.get("MAX_STORAGE_SIZE", 10)) * (1024**3)
    return {"used_bytes": used, "total_bytes": total, "percent": round(used/total*100, 1) if total else 0, "used_gb": round(used/1024**3, 2), "total_gb": round(total/1024**3, 2)}

def storage_is_full():
    i = get_storage_info(); return i["used_bytes"] >= i["total_bytes"]

# ── Purge & Archive ───────────────────────────────────────────────────────

def purge_oldest_songs(job=None):
    from .models import Song
    import time
    cfg = _cfg(); temp = Path(cfg["TEMP_FOLDER"]); perm = Path(cfg["PERMANENT_SAVING_DIR"]); perm.mkdir(parents=True, exist_ok=True)
    audio_exts = {".mp3", ".flac", ".m4a", ".opus", ".ogg", ".webm"}
    files = sorted([f for f in temp.rglob("*") if f.suffix.lower() in audio_exts], key=lambda f: f.stat().st_mtime)
    if not files: return
    
    m_str, pl_map = str(cfg.get("MONITORED_PLAYLISTS", "")).strip(), _get_playlist_track_map()
    m_list = [p.strip() for p in m_str.split(",") if p.strip()]
    hold_days, quota = int(cfg.get("HOLD_PERIOD_DAYS", 30)), int(cfg.get("MAX_DELETE_PER_PURGE", 100))
    hold_sec, now, deleted = hold_days * 86400, time.time(), 0
    
    emit(f"Purge Analysis: Checking {len(files)} files...", job=job)
    for f in files:
        if deleted >= quota: break
        
        # Exact filename match
        matched_pls = pl_map.get(f.name, set())
        
        is_protected = False
        if m_list:
            if any(pl in m_list for pl in matched_pls): is_protected = True
        else:
            if any(pl != 'latest' for pl in matched_pls): is_protected = True

        db_s = Song.objects.filter(filename=f.name).first()
        
        if is_protected:
            # Protect from deletion, archive if untagged
            if db_s and not db_s.needs_tagging and not db_s.pending_confirmation:
                new_p = perm / f.name
                try: 
                    old_p_str, new_p_str = str(f), str(new_p)
                    if not new_p.exists():
                        shutil.move(old_p_str, new_p_str)
                        _sync_navidrome_metadata(old_p_str, new_p_str, {'title':db_s.title,'artist':db_s.artist,'album':db_s.album,'album_artist':db_s.album_artist})
                        emit(f"Archived protected song: {f.name}", job=job)
                    if db_s: 
                        db_s.status = 'moved'; db_s.filepath = new_p_str; db_s.save()
                except Exception as e: emit(f"Archive error: {e}", level="error", job=job)
            continue
            
        # Delete if hold period passed
        if (now - f.stat().st_mtime) > hold_sec:
            emit(f"Deleting: {f.name}", job=job, event_type="purge_delete")
            f.unlink(missing_ok=True); f.with_suffix(".info.json").unlink(missing_ok=True); _delete_from_navidrome_db(f)
            if db_s: db_s.status = "deleted"; db_s.deleted_at = dj_tz.now(); db_s.save()
            deleted += 1
            
    emit(f"Purge complete. {deleted} files removed.", job=job)

def get_upcoming_purges():
    from .models import Song
    cfg = _cfg(); temp = Path(cfg["TEMP_FOLDER"]); audio_exts = {".mp3", ".flac", ".m4a", ".opus", ".ogg", ".webm"}
    if not temp.exists(): return {"candidates":[], "protected": []}
    files = sorted([f for f in temp.rglob("*") if f.suffix.lower() in audio_exts], key=lambda f: f.stat().st_mtime)
    m_str, pl_map = str(cfg.get("MONITORED_PLAYLISTS", "")).strip(), _get_playlist_track_map()
    m_list = [p.strip() for p in m_str.split(",") if p.strip()]
    hold_days, quota = int(cfg.get("HOLD_PERIOD_DAYS", 30)), int(cfg.get("MAX_DELETE_PER_PURGE", 100))
    hold_sec, now = hold_days * 86400, time.time()
    candidates, protected = [], []
    for f in files:
        # Exact filename match
        matched_pls = pl_map.get(f.name, set())
        
        is_protected = False
        if m_list:
            if any(pl in m_list for pl in matched_pls): is_protected = True
        else:
            if any(pl != 'latest' for pl in matched_pls): is_protected = True
            
        db_s = Song.objects.filter(filename=f.name).first()
        if is_protected:
            protected.append({"filename": f.name, "playlists": list(matched_pls), "match_reason": "Ready to Archive" if (db_s and not db_s.needs_tagging) else "Protected but Untagged"})
            continue
        if (now - f.stat().st_mtime) > hold_sec:
            if len(candidates) < quota: candidates.append({"filename": f.name, "mtime": f.stat().st_mtime})
    return {"candidates": candidates, "protected": protected, "debug_info": {"monitored_playlists": m_str or "All except 'latest'", "total_playlist_tracks": len(pl_map)}}

def _delete_from_navidrome_db(file_path):
    import sqlite3; db_path = "/navidrome_data/navidrome.db"
    if not os.path.exists(db_path): return
    try:
        with sqlite3.connect(db_path, timeout=10) as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM media_file WHERE path = ? OR path LIKE ?", (str(file_path).replace("/music/",""), f"%{file_path.name}"))
            conn.commit()
    except Exception: pass

# ── Discovery Logic ───────────────────────────────────────────────────────

def run_single_subscription(sub_id):
    from .models import SearchSubscription, DownloadJob
    try:
        sub = SearchSubscription.objects.get(pk=sub_id)
        if not sub.active: return
    except SearchSubscription.DoesNotExist: return

    cfg = _cfg(); temp = Path(cfg["TEMP_FOLDER"])
    job = DownloadJob.objects.create(job_type="manual", status="running", created_at=dj_tz.now(), url=f"Discovery: {sub.label}")
    emit(f"Discovery Started: {sub.label}", job=job)
    keywords = [k.strip() for k in sub.keywords.split(",") if k.strip()]
    newly_added = 0
    for kw in keywords:
        search_query = kw if kw.startswith("http") else f"ytsearch{sub.amount}:{kw}"
        files = _ytdlp_download(search_query, temp, f"discovery_{sub.id}", max_items=sub.amount, job=job, allow_playlist=True)
        if files: newly_added += len(register_songs(files, source=f"discovery:{sub.label}", job=job))
    sub.last_run = dj_tz.now(); sub.save(); job.status="done"; job.finished_at=dj_tz.now(); job.save()
    emit(f"Discovery Finished: {sub.label}", job=job)
    return newly_added

def run_search_subscriptions(force=False):
    from .models import SearchSubscription
    subs = SearchSubscription.objects.filter(active=True)
    any_added = False
    for sub in subs:
        if force or not sub.last_run or dj_tz.now() >= sub.last_run + timedelta(days=sub.cycle_days):
            added = run_single_subscription(sub.id)
            if added and added > 0: any_added = True
    if any_added: 
        navidrome_rescan()
        purge_oldest_songs()

# ── Song Registry & API ───────────────────────────────────────────────────

def register_songs(files, source="", job=None):
    from .models import Song
    added = []
    for f in files:
        if not f.exists(): continue
        t, a, al, aa = _read_basic_tags(f)
        needs_tagging, query_term, pending_conf = True, t if t else f.stem, False
        if query_term:
            match = search_musicbrainz_api(query_term, limit=1)
            if match:
                res = match[0]
                if difflib.SequenceMatcher(None, query_term.lower(), res['title'].lower()).ratio() > 0.9:
                    if not res.get("album"): res["album"] = res["title"]
                    if not res.get("album_artist"): res["album_artist"] = res.get("artist")
                    # Do NOT apply to file yet, just set database values and mark for confirmation
                    t, a, al, aa, needs_tagging, pending_conf = res['title'], res['artist'], res['album'], res['album_artist'], False, True
                    emit(f"Auto-Tag Suggested (needs confirmation): {t}", job=job)
        song, created = Song.objects.get_or_create(filename=f.name, defaults={"filepath": str(f), "title": t, "artist": a, "album": al, "source": source, "file_size": f.stat().st_size, "status": "active", "needs_tagging": needs_tagging, "pending_confirmation": pending_conf})
        if not created: 
            song.status, song.title, song.artist, song.needs_tagging, song.pending_confirmation = "active", t, a, needs_tagging, pending_conf
            song.save()
        if job: job.songs_added.add(song)
        added.append(song)
    return added

def _read_basic_tags(p):
    try:
        if p.suffix.lower() == ".mp3":
            from mutagen.id3 import ID3; tags = ID3(p)
            return (str(tags.get("TIT2","")), str(tags.get("TPE1","")), str(tags.get("TALB","")), str(tags.get("TPE2","")))
    except Exception: pass
    return "","","",""

def run_pipeline(job=None):
    if not job:
        from .models import DownloadJob
        job = DownloadJob.objects.create(job_type="cron", status="running")
    emit("Scheduled Pipeline Started", job=job)
    files = fetch_all_sources(job=job)
    if files: 
        register_songs(files, source="cron", job=job)
        navidrome_rescan(job=job)
    purge_oldest_songs(job=job)
    job.status="done"; job.finished_at=dj_tz.now(); job.save()
    emit("Scheduled Pipeline Complete ✓", job=job)

def search_media(query, limit=10):
    import subprocess, json
    from pathlib import Path
    cfg = _cfg()
    cmd = ["yt-dlp", "--js-runtimes", "node", "--remote-components", "ejs:github", "--dump-json", "--flat-playlist", f"ytsearch{limit}:{query}"]
    
    cookies_raw = cfg.get("YTDLP_COOKIES", "").strip()
    cookies_file = None
    
    if cookies_raw:
        cookies_file = Path(cfg["TEMP_FOLDER"]) / "ytdlp_cookies_search.txt"
        try:
            if cookies_raw.startswith("# Netscape") or "\t" in cookies_raw:
                cookies_file.write_text(cookies_raw + "\n", encoding="utf-8")
            else:
                header_val = cookies_raw
                if header_val.lower().startswith("cookie:"): header_val = header_val[7:].strip()
                lines = ["# Netscape HTTP Cookie File"]
                domain = ".youtube.com"
                for part in header_val.split(";"):
                    if "=" in part:
                        name, val = part.strip().split("=", 1)
                        lines.append(f"{domain}\tTRUE\t/\tFALSE\t0\t{name}\t{val}")
                cookies_file.write_text("\n".join(lines) + "\n", encoding="utf-8")
            cmd.extend(["--cookies", str(cookies_file)])
        except Exception: pass

    if cfg.get("YTDLP_PROXY"):
        cmd.extend(["--proxy", cfg["YTDLP_PROXY"]])
        
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        out = result.stdout
        results = []
        for line in out.splitlines():
            try:
                entry = json.loads(line)
                url = entry.get("url")
                if not url and entry.get("id"):
                    url = f"https://www.youtube.com/watch?v={entry.get('id')}"
                
                # FILTER: Skip channels/users/playlists in manual search results too
                if entry.get("_type") in ["url", "playlist"] and any(x in url.lower() for x in ["/channel/", "/user/", "/@", "/playlist?list="]):
                    continue

                if url:
                    # Extract the best available thumbnail
                    thumb = entry.get("thumbnail")
                    if not thumb and entry.get("thumbnails"):
                        thumb = entry["thumbnails"][0].get("url")
                    
                    results.append({
                        "id": entry.get("id"),
                        "title": entry.get("title"),
                        "uploader": entry.get("uploader"),
                        "duration": entry.get("duration"),
                        "url": url,
                        "thumbnail": thumb
                    })
            except Exception: continue
        return results
    except Exception as e:
        raise Exception(f"Media search failed: {e}")
    finally:
        if cookies_file and cookies_file.exists():
            try: cookies_file.unlink()
            except: pass

def search_musicbrainz_api(query, limit=10):
    import requests, musicbrainzngs
    itunes_q, mb_q = query, query
    am, rm = re.search(r'artist:"([^"]+)"', query), re.search(r'recording:"([^"]+)"', query)
    if am or rm:
        terms = []
        if am: terms.append(am.group(1))
        if rm: terms.append(rm.group(1))
        itunes_q = " ".join(terms)
    all_res, seen = [], set()
    try:
        r = requests.get("https://itunes.apple.com/search", params={"term": itunes_q, "entity": "song", "limit": limit}, timeout=10)
        for i in r.json().get("results", []):
            res = {"source": "itunes", "title": i.get("trackName"), "artist": i.get("artistName"), "album": i.get("collectionName"), "album_artist": i.get("artistName"), "cover_url": i.get("artworkUrl100", "").replace("100x100bb.jpg", "600x600bb.jpg")}
            all_res.append(res); seen.add(f"i_{i.get('trackId')}")
    except Exception: pass
    try:
        musicbrainzngs.set_useragent("MusicUpdater", "0.1.0", "you@example.com")
        m_resp = musicbrainzngs.search_recordings(query=mb_q, limit=limit)
        for rec in m_resp.get("recording-list", []):
            res = {"source": "musicbrainz", "title": rec.get("title"), "artist": rec.get("artist-credit-phrase"), "album": "", "album_artist": "", "cover_url": ""}
            rels = rec.get("release-list", [])
            if rels: 
                rel = rels[0]; res["album"], res["album_artist"] = rel.get("title"), rel.get("artist-credit-phrase")
                mbid = rel.get("id"); res["cover_url"] = f"https://coverartarchive.org/release/{mbid}/front-500"
            all_res.append(res); seen.add(f"m_{rec.get('id')}")
    except Exception: pass
    def score(i):
        t = f"{i['artist']} - {i['title']}".lower(); r = difflib.SequenceMatcher(None, itunes_q.lower(), t).ratio()
        if i["cover_url"]: r += 0.1
        return r
    all_res.sort(key=score, reverse=True); return all_res[:limit]

def apply_manual_tags(song, data):
    from pathlib import Path; from .models import DownloadJob
    path = Path(song.filepath)
    if not path.exists(): raise Exception("File not found")
    
    # Fallback: if album is empty, use title
    if not data.get("album") and data.get("title"):
        data["album"] = data["title"]
        if not data.get("album_artist"):
            data["album_artist"] = data.get("artist")

    job = DownloadJob.objects.create(job_type="manual", status="running", url=f"Tag Update: {data.get('title', song.filename)}")
    emit(f"Starting tag update: {song.filename}", job=job)
    try:
        old_p_str, t, ext = str(path), data.get("title"), path.suffix.lower()
        apply_manual_tags_to_file(path, data)
        if t:
            new_name = f"{_sanitize_filename(t)}{ext}"; new_path = path.parent / new_name
            if new_path != path:
                if new_path.exists(): new_path.unlink()
                path.rename(new_path); song.filename, song.filepath = new_name, str(new_path)
                _sync_navidrome_metadata(old_p_str, str(new_path), data)
                emit(f"Renamed: {new_name}", job=job)
        song.title, song.artist, song.album, song.album_artist = data.get("title"), data.get("artist"), data.get("album"), data.get("album_artist")
        if "needs_tagging" in data: song.needs_tagging = data["needs_tagging"]
        song.pending_confirmation = False
        song.save(); job.status, job.finished_at = "done", dj_tz.now(); job.save(); emit(f"Tagging successful", job=job); navidrome_rescan(); return song
    except Exception as e:
        job.status, job.error = "failed", str(e); job.save(); emit(f"Tagging failed: {e}", job=job, level="error"); raise e

def revert_song_to_original(song):
    from pathlib import Path
    path = Path(song.filepath)
    if not path.exists(): raise Exception("File not found")
    t, a, al, aa = _read_basic_tags(path)
    song.title = t
    song.artist = a
    song.album = al
    song.album_artist = aa
    song.needs_tagging = False
    song.pending_confirmation = False
    song.save()
    navidrome_rescan()

def apply_manual_tags_to_file(path, data):
    import requests
    t, a, al, aa, c_u = data.get("title"), data.get("artist"), data.get("album"), data.get("album_artist"), data.get("cover_url", "")
    
    # Fallback for file tags
    if not al and t: al = t
    if not aa and a: aa = a

    c_d = None
    if c_u:
        try:
            if c_u.startswith("data:image"):
                import base64; _, enc = c_u.split(",", 1); c_d = base64.b64decode(enc)
            else:
                r = requests.get(c_u, timeout=10); c_d = r.content if r.status_code == 200 else None
        except Exception: pass
    if path.suffix.lower() == ".mp3":
        from mutagen.id3 import ID3, TIT2, TPE1, TALB, TPE2, APIC, ID3NoHeaderError
        try: tags = ID3(path)
        except ID3NoHeaderError: tags = ID3()
        tags["TIT2"], tags["TPE1"], tags["TALB"], tags["TPE2"] = TIT2(encoding=3, text=t), TPE1(encoding=3, text=a), TALB(encoding=3, text=al), TPE2(encoding=3, text=aa)
        if c_d: tags.delall("APIC"); tags["APIC"] = APIC(encoding=3, mime="image/jpeg", type=3, desc="Cover", data=c_d)
        tags.save(path)

def auto_tag_all_untagged():
    from .models import Song; songs = Song.objects.filter(status="active", needs_tagging=True)
    c = 0
    for s in songs:
        res = search_musicbrainz_api(s.title or Path(s.filepath).stem, 1)
        if res:
            tags = res[0]; tags["needs_tagging"] = False 
            try: apply_manual_tags(s, tags); c += 1
            except Exception: pass
    return c

def cleanup_deleted_history(days_override: int = None) -> int:
    from .models import Song; cfg = _cfg(); d = days_override if days_override is not None else int(cfg.get("DELETED_HISTORY_RETENTION_DAYS", 30))
    cutoff = dj_tz.now() - timedelta(days=d); recs = Song.objects.filter(status="deleted", deleted_at__lt=cutoff); count = recs.count(); recs.delete(); return count

def retry_interrupted_jobs():
    from .models import DownloadJob; DownloadJob.objects.filter(status="running").update(status="failed", error="Interrupted")

def confirm_pending_tags(song_ids=None, job=None):
    from .models import Song
    qs = Song.objects.filter(pending_confirmation=True)
    if song_ids: qs = qs.filter(id__in=song_ids)
    
    count = 0
    for song in qs:
        try:
            data = {'title': song.title, 'artist': song.artist, 'album': song.album, 'album_artist': song.album_artist}
            apply_manual_tags_to_file(Path(song.filepath), data)
            song.pending_confirmation = False
            song.save()
            count += 1
            emit(f"Confirmed tags for: {song.title}", job=job)
        except Exception as e:
            emit(f"Failed to confirm tags for {song.filename}: {e}", level="error", job=job)
    
    if count > 0: navidrome_rescan(job=job)
    return count

def reject_pending_tags(song_ids=None, job=None):
    from .models import Song
    qs = Song.objects.filter(pending_confirmation=True)
    if song_ids: qs = qs.filter(id__in=song_ids)
    
    count = 0
    for song in qs:
        # Revert to original or mark as needs tagging
        song.pending_confirmation = False
        song.needs_tagging = True
        song.save()
        count += 1
        emit(f"Rejected tags for: {song.filename}", job=job)
    return count

def get_navidrome_playlists():
    cfg = _cfg(); base = cfg["NAVIDROME_URL"].rstrip("/"); passwd = cfg["NAVIDROME_PASSWORD"]
    s = secrets.token_hex(6); tk = hashlib.md5(f"{passwd}{s}".encode()).hexdigest()
    p = {"u": cfg["NAVIDROME_USER"], "t": tk, "s": s, "v": "1.16.1", "c": "NDM", "f": "json"}
    try:
        r = requests.get(f"{base}/rest/getPlaylists", params=p, timeout=10)
        return [{"id": x.get("id"), "name": x.get("name"), "songCount": x.get("songCount")} for x in r.json().get("subsonic-response",{}).get("playlists",{}).get("playlist",[])]
    except Exception: return []
