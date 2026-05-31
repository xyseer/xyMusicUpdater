import json
import os
import subprocess
import sqlite3
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from django.utils import timezone as dj_tz
from .utils import _cfg, emit, _normalize_for_match

def _is_valid_audio(path: Path) -> bool:
    """Verifies audio file integrity using ffprobe."""
    if not path.exists() or path.stat().st_size == 0:
        return False
    try:
        # Check if ffprobe can read the duration/format info
        cmd = ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(path)]
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        return res.returncode == 0 and len(res.stdout.strip()) > 0
    except:
        return False

def _is_duplicate(title: str, uploader: str = "", video_id: str = "") -> bool:
    from ..models import Song
    if not title:
        return False
    
    # 1. Primary Check: Video ID (Strongest Match)
    # We check ALL songs, including deleted ones, to prevent re-downloading items purged by quota
    if video_id:
        if Song.objects.filter(video_id=video_id).exists():
            return True

    t_lower = title.lower()
    u_lower = uploader.lower() if uploader else ""
    norm = _normalize_for_match(title)
    
    # 2. Local DB Checks (Heuristics)
    # We check ALL songs (active, moved, deleted) to prevent re-downloading items 
    # that were already processed by this system.
    existing_songs = Song.objects.all()
    for song in existing_songs:
        db_t, db_a = song.title, song.artist
        if not db_t:
            continue
        db_t_lower = db_t.lower()
        db_a_lower = db_a.lower() if db_a else ""
        db_norm = _normalize_for_match(db_t)
        
        # Exact title & artist (uploader) match
        if u_lower and db_a_lower:
            if db_t_lower == t_lower and db_a_lower == u_lower:
                return True
            
        # Bi-directional inclusion (Requires both title and artist match for high confidence)
        if db_a_lower and len(db_a_lower) > 2 and len(db_norm) > 3:
            if (db_norm in norm and _normalize_for_match(db_a_lower) in norm) or \
               (norm in db_norm and _normalize_for_match(u_lower) in db_norm):
                return True
            
        # Aggressive Title-Only match (especially for untagged songs)
        # If one normalized title is a subset of the other and is long enough
        if len(db_norm) > 4 and len(norm) > 4:
            if db_norm in norm or norm in db_norm:
                # Extra check: if uploader is known and artist is known, they should probably match too
                # but if one is missing, we trust the title inclusion
                if not u_lower or not db_a_lower or _normalize_for_match(u_lower) in norm or _normalize_for_match(db_a_lower) in norm:
                    return True
        
        # Fallback exact match
        if db_t_lower == t_lower:
            return True
        
    # 3. Navidrome DB Checks (Direct SQL)
    db_path = "/navidrome_data/navidrome.db"
    if os.path.exists(db_path):
        try:
            with sqlite3.connect(db_path, timeout=10) as conn:
                cursor = conn.cursor()
                # Exact Title/Artist Match
                if u_lower:
                    cursor.execute("SELECT 1 FROM media_file WHERE lower(title) = ? AND lower(artist) = ? AND missing=0", (t_lower, u_lower))
                else:
                    cursor.execute("SELECT 1 FROM media_file WHERE lower(title) = ? AND missing=0", (t_lower,))
                if cursor.fetchone(): return True

                # Optimized Heuristics: Fetch only potential candidates
                cursor.execute("SELECT title, artist FROM media_file WHERE missing=0 AND (title LIKE ? OR ? LIKE '%' || title || '%')", (f"%{t_lower[:10]}%", t_lower))
                for nd_t, nd_a in cursor.fetchall():
                    if not nd_t: continue
                    ndt_l = nd_t.lower()
                    nda_l = nd_a.lower() if nd_a else ""
                    
                    if nda_l and len(nda_l) > 2 and len(ndt_l) > 2:
                        if ndt_l in t_lower and nda_l in t_lower: return True
        except Exception:
            pass
            
    return False

def _sanitize_ytdlp_out(text: str, cfg: Dict[str, Any]) -> str:
    if not text:
        return ""
    s = text
    if cfg.get("YTDLP_PASSWORD"):
        s = s.replace(cfg["YTDLP_PASSWORD"], "********")
    
    cookies = cfg.get("YTDLP_COOKIES", "")
    if cookies:
        if "=" in cookies and ";" in cookies:
            for part in cookies.split(";"):
                if "=" in part:
                    _, val = part.split("=", 1)
                    val = val.strip()
                    if len(val) > 5:
                        s = s.replace(val, "********")
        for line in cookies.splitlines():
            parts = line.split("\t")
            if len(parts) > 6:
                val = parts[6].strip()
                if len(val) > 5:
                    s = s.replace(val, "********")
    return s

def _ytdlp_download(url: str, dest: Path, label: str, max_items: int = 10, job: Optional[Any] = None, allow_playlist: bool = True, override_duplicate: bool = False, on_file_ready=None) -> List[Path]:
    emit(f"Analyzing source: {url}", job=job)
    cfg = _cfg()
    cmd_meta = ["yt-dlp", "--js-runtimes", "node", "--remote-components", "ejs:github", "--flat-playlist", "--dump-json", "--playlist-end", str(max_items)]
    
    cookies_raw = cfg.get("YTDLP_COOKIES", "").strip()
    cookies_file = None
    
    if cookies_raw:
        cookies_file = Path(cfg["TEMP_FOLDER"]) / "ytdlp_cookies.txt"
        try:
            if cookies_raw.startswith("# Netscape") or "\t" in cookies_raw:
                cookies_file.write_text(cookies_raw + "\n", encoding="utf-8")
            else:
                header_val = cookies_raw
                if header_val.lower().startswith("cookie:"):
                    header_val = header_val[7:].strip()
                lines = ["# Netscape HTTP Cookie File"]
                domain = ".youtube.com"
                if "music.youtube.com" in url: domain = ".youtube.com"
                elif "google.com" in url: domain = ".google.com"
                for part in header_val.split(";"):
                    if "=" in part:
                        name, val = part.strip().split("=", 1)
                        lines.append(f"{domain}\tTRUE\t/\tFALSE\t0\t{name}\t{val}")
                cookies_file.write_text("\n".join(lines) + "\n", encoding="utf-8")
            cmd_meta.extend(["--cookies", str(cookies_file)])
        except Exception as e:
            emit(f"Failed to write cookies file: {e}", level="warning", job=job)
    
    if cfg.get("YTDLP_USERNAME"):
        cmd_meta.extend(["--username", cfg["YTDLP_USERNAME"]])
        if cfg.get("YTDLP_PASSWORD"):
            cmd_meta.extend(["--password", cfg["YTDLP_PASSWORD"]])
    if cfg.get("YTDLP_PROXY"):
        cmd_meta.extend(["--proxy", cfg["YTDLP_PROXY"]])

    if not allow_playlist:
        cmd_meta.append("--no-playlist")
    cmd_meta.append(url)
    targets = []
    
    try:
        result = subprocess.run(cmd_meta, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, errors="replace", timeout=120)
        out, err = result.stdout, result.stderr

        for line in out.splitlines():
            try:
                entry = json.loads(line)
                title, vid, uploader, video_id = entry.get("title"), entry.get("url") or entry.get("id"), entry.get("uploader", ""), entry.get("id", "")
                
                is_container = entry.get("_type") in ["url", "playlist"] and any(x in vid.lower() for x in ["/channel/", "/user/", "/@", "/playlist?list="])
                if is_container:
                    emit(f"Skip Container: {title}", job=job)
                    continue

                if vid and title:
                    if not override_duplicate and _is_duplicate(title, uploader, video_id): 
                        emit(f"Skip Duplicate: {title}", job=job)
                    else: 
                        targets.append((title, vid, video_id))
            except:
                continue
            
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
    
    for title, vid, video_id in targets:
        emit(f"Downloading: {title}", job=job)
        cmd = ["yt-dlp", "--js-runtimes", "node", "--remote-components", "ejs:github", "--no-playlist", "-x", "--audio-format", "mp3", "--audio-quality", "0", "--no-mtime", "--no-overwrites", "--no-part", "--add-metadata", "--embed-thumbnail", "--output", output_tpl]
        
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
                # Only delete known partial/temp artifacts — never touch completed .mp3 files
                # that may belong to a concurrent download job running in another thread.
                _PARTIAL_SUFFIXES = {".part", ".ytdl", ".tmp"}
                for f in (set(dest.iterdir()) - before):
                    if f.suffix in _PARTIAL_SUFFIXES or ".temp." in f.name:
                        try: f.unlink()
                        except: pass
                err_msg = _sanitize_ytdlp_out(res.stderr, cfg)
                emit(f"Download failed for {title}: {err_msg}", level="error", job=job)
            else:
                new_files = [f for f in (set(dest.iterdir()) - before) if f.suffix.lower() == ".mp3"]
                valid_files = []
                # 2. Verify integrity of new files using FFmpeg/ffprobe
                for nf in new_files:
                    if _is_valid_audio(nf):
                        valid_files.append(nf)
                        # Save video_id to sidecar files for registration
                        Path(str(nf) + ".vid").write_text(video_id, encoding="utf-8")
                        # Per-file callback: immediately push into pipeline if provided
                        if on_file_ready:
                            try:
                                on_file_ready(nf)
                            except Exception as cb_err:
                                emit(f"Post-download callback error for {nf.name}: {cb_err}", level="warning", job=job)
                    else:
                        emit(f"Corrupted file detected: {nf.name}. Deleting.", level="error", job=job)
                        nf.unlink(missing_ok=True)
                downloaded_files.extend(valid_files)
        except Exception as e:
            _PARTIAL_SUFFIXES = {".part", ".ytdl", ".tmp"}
            for f in (set(dest.iterdir()) - before):
                if f.suffix in _PARTIAL_SUFFIXES or ".temp." in f.name:
                    try: f.unlink()
                    except: pass
            emit(f"yt-dlp execution failed for {title}: {e}", level="error", job=job)

    if cookies_file and cookies_file.exists():
        try:
            cookies_file.unlink()
        except:
            pass
    return downloaded_files

def download_url(url: str, job: Optional[Any] = None, allow_playlist: bool = False, override_duplicate: bool = False) -> List[Path]:
    from .pipeline import register_songs
    from .navidrome import navidrome_rescan

    cfg = _cfg()
    temp = Path(cfg["TEMP_FOLDER"])
    temp.mkdir(parents=True, exist_ok=True)
    limit = int(cfg.get("MAX_SONGS_PER_SOURCE", 100))
    if not job:
        from ..models import DownloadJob
        job = DownloadJob.objects.create(job_type="manual", status="running", url=url)
    emit(f"Starting Download: {url}", job=job)

    # Per-song callback: register into DB immediately so the song is visible right away.
    # Navidrome rescan is NOT triggered here — one incremental rescan fires after the
    # entire job finishes (in _run_manual_job) to avoid hammering Navidrome per song.
    def _on_file_ready(f: Path) -> None:
        register_songs([f], source="manual", job=job)

    files = _ytdlp_download(
        url, temp, "manual",
        max_items=limit, job=job,
        allow_playlist=allow_playlist,
        override_duplicate=override_duplicate,
        on_file_ready=_on_file_ready,
    )
    return files

def search_media(query: str, limit: int = 10) -> List[Dict[str, Any]]:
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
        except Exception:
            pass

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
                
                if entry.get("_type") in ["url", "playlist"] and any(x in url.lower() for x in ["/channel/", "/user/", "/@", "/playlist?list="]):
                    continue

                if url:
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
            except Exception:
                continue
        return results
    except Exception as e:
        raise Exception(f"Media search failed: {e}")
    finally:
        if cookies_file and cookies_file.exists():
            try:
                cookies_file.unlink()
            except:
                pass
