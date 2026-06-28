import base64
import difflib
import json
import os
import re
import requests
import musicbrainzngs
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from django.utils import timezone as dj_tz
from .utils import _cfg, emit, _sanitize_filename, _clean_query, _score_title_match
from .navidrome import navidrome_rescan, _sync_navidrome_metadata

def fingerprint_match(path: Path) -> Optional[Dict[str, Any]]:
    """Identify an audio file via AcoustID fingerprinting (fpcalc + acoustid.org).

    Returns a metadata dict on success, or None if fpcalc is unavailable,
    the key is not configured, or no confident match is found.
    """
    import subprocess as _sp
    import json as _json

    api_key = _cfg().get("ACOUSTID_API_KEY", "").strip()
    if not api_key:
        return None
    if not path.exists():
        return None

    # 1. Generate audio fingerprint with fpcalc (Chromaprint)
    try:
        res = _sp.run(
            ["fpcalc", "-json", str(path)],
            capture_output=True, text=True, timeout=30
        )
        if res.returncode != 0:
            return None
        fp_data = _json.loads(res.stdout)
        fingerprint = fp_data.get("fingerprint", "")
        duration = int(fp_data.get("duration", 0))
    except Exception:
        return None

    if not fingerprint or duration < 10:
        return None

    # 2. AcoustID lookup
    try:
        r = requests.get("https://api.acoustid.org/v2/lookup", params={
            "client": api_key,
            "fingerprint": fingerprint,
            "duration": duration,
            "meta": "recordings releases releasegroups",
        }, timeout=15)
        resp = r.json()
    except Exception:
        return None

    if resp.get("status") != "ok":
        return None

    results = sorted(resp.get("results", []), key=lambda x: x.get("score", 0), reverse=True)
    if not results or results[0].get("score", 0) < 0.75:
        return None

    recordings = results[0].get("recordings", [])
    if not recordings:
        return None

    # 3. Pick the recording with the most complete metadata
    rec = recordings[0]
    title = rec.get("title", "")
    artist = (rec.get("artists") or [{}])[0].get("name", "")

    album, album_artist = "", ""
    releases = rec.get("releases", [])
    if releases:
        rel = releases[0]
        album = rel.get("title", "")
        album_artist = (rel.get("artists") or [{}])[0].get("name", "")

    if not title:
        return None

    return {
        "title": title,
        "artist": artist,
        "album": album or title,
        "album_artist": album_artist or artist,
        "cover_url": "",
        "source": "acoustid",
        "score": results[0].get("score", 0),
    }


def _read_basic_tags(p: Path) -> Tuple[str, str, str, str]:
    try:
        if p.suffix.lower() == ".mp3":
            from mutagen.id3 import ID3
            tags = ID3(p)
            return (
                str(tags.get("TIT2", "")), 
                str(tags.get("TPE1", "")), 
                str(tags.get("TALB", "")), 
                str(tags.get("TPE2", ""))
            )
    except Exception:
        pass
    return "", "", "", ""

def search_musicbrainz_api(query: str, limit: int = 10) -> List[Dict[str, Any]]:
    itunes_q, mb_q = query, query
    am, rm = re.search(r'artist:"([^"]+)"', query), re.search(r'recording:"([^"]+)"', query)
    if am or rm:
        terms = []
        if am: terms.append(am.group(1))
        if rm: terms.append(rm.group(1))
        itunes_q = " ".join(terms)
    
    all_res, seen = [], set()
    try:
        itunes_params: Dict[str, Any] = {"term": itunes_q, "entity": "song", "limit": limit}
        r = requests.get("https://itunes.apple.com/search", params=itunes_params, timeout=10)
        for i in r.json().get("results", []):
            res = {
                "source": "itunes", 
                "title": i.get("trackName"), 
                "artist": i.get("artistName"), 
                "album": i.get("collectionName"), 
                "album_artist": i.get("artistName"), 
                "cover_url": i.get("artworkUrl100", "").replace("100x100bb.jpg", "600x600bb.jpg")
            }
            all_res.append(res)
            seen.add(f"i_{i.get('trackId')}")
    except Exception:
        pass

    try:
        musicbrainzngs.set_useragent("MusicUpdater", "0.1.0", "admin@example.com")
        m_resp = musicbrainzngs.search_recordings(query=mb_q, limit=limit)
        for rec in m_resp.get("recording-list", []):
            res = {
                "source": "musicbrainz", 
                "title": rec.get("title"), 
                "artist": rec.get("artist-credit-phrase"), 
                "album": "", 
                "album_artist": "", 
                "cover_url": ""
            }
            rels = rec.get("release-list", [])
            if rels: 
                rel = rels[0]
                res["album"], res["album_artist"] = rel.get("title"), rel.get("artist-credit-phrase")
                mbid = rel.get("id")
                res["cover_url"] = f"https://coverartarchive.org/release/{mbid}/front-500"
            all_res.append(res)
    except Exception:
        pass

    def score(i):
        t = f"{i['artist']} - {i['title']}".lower()
        r = difflib.SequenceMatcher(None, itunes_q.lower(), t).ratio()
        if i["cover_url"]: r += 0.1
        return r

    all_res.sort(key=score, reverse=True)
    return all_res[:limit]

def apply_manual_tags_to_file(path: Path, data: Dict[str, Any]) -> None:
    t = data.get("title")
    a = data.get("artist")
    al = data.get("album")
    aa = data.get("album_artist")
    c_u = data.get("cover_url", "")
    
    if not al and t: al = t
    if not aa and a: aa = a

    c_d = None
    if c_u:
        try:
            if c_u.startswith("data:image"):
                _, enc = c_u.split(",", 1)
                c_d = base64.b64decode(enc)
            else:
                r = requests.get(c_u, timeout=10)
                c_d = r.content if r.status_code == 200 else None
        except Exception:
            pass

    if path.suffix.lower() == ".mp3":
        from mutagen.id3 import ID3, TIT2, TPE1, TALB, TPE2, APIC, TCMP, ID3NoHeaderError
        try:
            tags = ID3(path)
        except ID3NoHeaderError:
            tags = ID3()
        
        tags["TIT2"] = TIT2(encoding=3, text=t)
        tags["TPE1"] = TPE1(encoding=3, text=a)
        tags["TALB"] = TALB(encoding=3, text=al)
        tags["TPE2"] = TPE2(encoding=3, text=aa)
        
        if data.get("compilation"):
            tags["TCMP"] = TCMP(encoding=3, text="1")
        
        if c_d:
            tags.delall("APIC")
            tags["APIC"] = APIC(encoding=3, mime="image/jpeg", type=3, desc="Cover", data=c_d)
        tags.save(path)

def _pending_cover_sidecar(path: Path) -> Path:
    return Path(str(path) + ".cover_url")

def _read_pending_cover_url(path: Path) -> str:
    sidecar = _pending_cover_sidecar(path)
    if not sidecar.exists():
        return ""
    try:
        return sidecar.read_text(encoding="utf-8").strip()
    except Exception:
        return ""

def _clear_pending_cover_url(path: Path) -> None:
    try:
        _pending_cover_sidecar(path).unlink(missing_ok=True)
    except Exception:
        pass

def apply_manual_tags(song: Any, data: Dict[str, Any]) -> Any:
    from pathlib import Path
    from ..models import DownloadJob
    path = Path(song.filepath)
    if not path.exists():
        raise Exception("File not found")
    
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
            new_name = f"{_sanitize_filename(t)}{ext}"
            new_path = path.parent / new_name
            if new_path != path:
                if new_path.exists():
                    new_path.unlink()
                path.rename(new_path)
                song.filename, song.filepath = new_name, str(new_path)
                _sync_navidrome_metadata(old_p_str, str(new_path), data)
                emit(f"Renamed: {new_name}", job=job)
        
        song.title = data.get("title")
        song.artist = data.get("artist")
        song.album = data.get("album")
        song.album_artist = data.get("album_artist")
        if "needs_tagging" in data:
            song.needs_tagging = data["needs_tagging"]
        song.pending_confirmation = False
        song.save()
        
        job.status, job.finished_at = "done", dj_tz.now()
        job.save()
        emit(f"Tagging successful", job=job)
        navidrome_rescan()
        return song
    except Exception as e:
        job.status, job.error = "failed", str(e)
        job.save()
        emit(f"Tagging failed: {e}", job=job, level="error")
        raise e

def revert_song_to_original(song: Any) -> None:
    path = Path(song.filepath)
    if not path.exists():
        raise Exception("File not found")
    t, a, al, aa = _read_basic_tags(path)
    song.title = t
    song.artist = a
    song.album = al
    song.album_artist = aa
    song.needs_tagging = False
    song.pending_confirmation = False
    song.save()
    _clear_pending_cover_url(path)
    navidrome_rescan()

def auto_tag_all_untagged() -> int:
    from ..models import Song
    # Only pick songs that haven't been staged for confirmation yet
    songs = Song.objects.filter(status="active", needs_tagging=True, pending_confirmation=False)
    c = 0
    for s in songs:
        raw_query = s.title or Path(s.filepath).stem
        candidate, score = None, 0.0

        # Stage 1: AcoustID fingerprinting
        fp = fingerprint_match(Path(s.filepath))
        if fp and fp.get("title"):
            candidate = fp
            score = fp.get("score", 0)
            emit(f"Fingerprint Match (score={score:.2f}): {fp['title']}", level="info")

        # Stage 2: Text search fallback
        if not candidate or score < 0.75:
            clean_q = _clean_query(raw_query)
            res = search_musicbrainz_api(clean_q or raw_query, 3)
            if res:
                for r in res:
                    s_score = _score_title_match(raw_query, r.get("title") or "")
                    if s_score > score:
                        score, candidate = s_score, r

        if candidate and score >= 0.65:
                if not candidate.get("album"):
                    candidate["album"] = candidate.get("title") or s.album
                if not candidate.get("album_artist"):
                    candidate["album_artist"] = candidate.get("artist") or s.album_artist
                s.title = candidate.get("title") or s.title
                s.artist = candidate.get("artist") or s.artist
                s.album = candidate.get("album") or s.album
                s.album_artist = candidate.get("album_artist") or s.album_artist
                s.needs_tagging = False

                # Perfect AcoustID fingerprint (score=1.00): write to file immediately, no user confirmation needed
                if candidate.get("source") == "acoustid" and score >= 1.0:
                    apply_manual_tags_to_file(Path(s.filepath), {
                        "title": s.title,
                        "artist": s.artist,
                        "album": s.album,
                        "album_artist": s.album_artist,
                    })
                    s.pending_confirmation = False
                    s.save()
                    emit(f"Auto-Confirmed (fingerprint=1.00): {s.title}", level="info")
                else:
                    # Stage in DB only — write to file after user confirmation
                    s.pending_confirmation = True
                    s.save()
                    emit(f"Auto-Tag Staged (awaiting confirmation): {s.title}", level="info")
                c += 1
    return c

def confirm_pending_tags(song_ids: Optional[List[int]] = None, job: Optional[Any] = None) -> int:
    from ..models import Song
    qs = Song.objects.filter(pending_confirmation=True)
    if song_ids:
        qs = qs.filter(id__in=song_ids)
    
    count = 0
    for song in qs:
        try:
            path = Path(song.filepath)
            data = {'title': song.title, 'artist': song.artist, 'album': song.album, 'album_artist': song.album_artist}
            cover_url = _read_pending_cover_url(path)
            if cover_url:
                data["cover_url"] = cover_url
            apply_manual_tags_to_file(path, data)
            _clear_pending_cover_url(path)
            song.pending_confirmation = False
            song.save()
            count += 1
            emit(f"Confirmed tags for: {song.title}", job=job)
        except Exception as e:
            emit(f"Failed to confirm tags for {song.filename}: {e}", level="error", job=job)
    
    if count > 0:
        navidrome_rescan(job=job)
    return count

def reject_pending_tags(song_ids: Optional[List[int]] = None, job: Optional[Any] = None) -> int:
    from ..models import Song
    qs = Song.objects.filter(pending_confirmation=True)
    if song_ids:
        qs = qs.filter(id__in=song_ids)
    
    count = 0
    for song in qs:
        _clear_pending_cover_url(Path(song.filepath))
        song.pending_confirmation = False
        song.needs_tagging = True
        song.save()
        count += 1
        emit(f"Rejected tags for: {song.filename}", job=job)
    return count

_COMPILATION_IGNORED_FILE = Path("/app/data/compilation_ignored.json")

def _load_ignored_nd_ids() -> set:
    if not _COMPILATION_IGNORED_FILE.exists():
        return set()
    try:
        return set(json.loads(_COMPILATION_IGNORED_FILE.read_text()))
    except Exception:
        return set()

def ignore_compilation_songs(nd_ids: List[str]) -> None:
    existing = _load_ignored_nd_ids()
    existing.update(nd_ids)
    _COMPILATION_IGNORED_FILE.parent.mkdir(parents=True, exist_ok=True)
    _COMPILATION_IGNORED_FILE.write_text(json.dumps(list(existing)))

def get_compilation_candidates(page: int = 1, page_size: int = 50) -> Dict[str, Any]:
    import sqlite3
    from urllib.parse import unquote
    db_path = "/navidrome_data/navidrome.db"
    empty = {"results": [], "total": 0, "page": page, "page_size": page_size}
    if not os.path.exists(db_path):
        return empty

    # Albums qualify as compilation candidates when:
    #   - they have more than 1 distinct track artist, AND
    #   - NOT all songs already share the same non-empty album_artist
    #     (covers both "Various Artists" and any custom merge target)
    _QUALIFY_SQL = """
        SELECT lower(album) as lower_album,
               count(distinct lower(artist)) as artist_count,
               count(distinct CASE WHEN album_artist IS NOT NULL AND album_artist != ''
                                   THEN lower(album_artist) ELSE NULL END) as distinct_aa_count,
               min(CASE WHEN album_artist IS NOT NULL AND album_artist != '' THEN 1 ELSE 0 END) as all_have_aa
        FROM media_file
        WHERE missing=0 AND album != ""
        GROUP BY lower_album
    """
    _FILTER = "artist_count > 1 AND NOT (distinct_aa_count = 1 AND all_have_aa = 1)"

    ignored = _load_ignored_nd_ids()

    try:
        with sqlite3.connect(db_path, timeout=15) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()

            cursor.execute(f"SELECT count(*) FROM ({_QUALIFY_SQL}) WHERE {_FILTER}")
            total = cursor.fetchone()[0]

            cursor.execute(f"""
                SELECT lower_album, artist_count FROM ({_QUALIFY_SQL})
                WHERE {_FILTER}
                ORDER BY lower_album
                LIMIT ? OFFSET ?
            """, (page_size, (page - 1) * page_size))
            album_rows = cursor.fetchall()

            candidates = []
            for row in album_rows:
                lower_album = row["lower_album"]
                cursor.execute("""
                    SELECT id, title, artist, album, album_artist, path
                    FROM media_file
                    WHERE lower(album) = ? AND missing=0
                    ORDER BY title
                    LIMIT 200
                """, (lower_album,))
                songs = []
                display_album_name = ""
                for s in cursor.fetchall():
                    if s["id"] in ignored:
                        continue
                    if not display_album_name:
                        display_album_name = s["album"]
                    songs.append({
                        "nd_id": s["id"],
                        "title": s["title"],
                        "artist": s["artist"],
                        "album": s["album"],
                        "album_artist": s["album_artist"],
                        "path": unquote(s["path"]),
                    })
                # Only include group if still has 2+ distinct artists after ignore filter
                if len(songs) >= 2 and len({s["artist"].lower() for s in songs}) > 1:
                    candidates.append({
                        "album": display_album_name,
                        "artist_count": len({s["artist"].lower() for s in songs}),
                        "songs": songs,
                    })

    except Exception as e:
        emit(f"Error finding compilation candidates: {e}", level="error")
        return empty

    return {"results": candidates, "total": total, "page": page, "page_size": page_size}

def _resolve_nd_path(raw_path: str) -> Optional[Path]:
    """Resolve a Navidrome-relative path to an absolute path on this container's filesystem.

    Navidrome stores paths relative to ND_MUSICFOLDER. NAVIDROME_MUSIC_ROOT tells us
    where that folder is mounted inside *this* container.
    """
    cfg = _cfg()
    nd_root = cfg.get("NAVIDROME_MUSIC_ROOT", "/music").rstrip("/")
    candidates: List[Path] = []

    if raw_path.startswith("/"):
        # Already absolute — try as-is, then remap under nd_root as fallback
        candidates.append(Path(raw_path))
    else:
        # Relative to Navidrome's library root
        candidates.append(Path(nd_root) / raw_path)

    # Filename-only fallback: search TEMP_FOLDER and PERMANENT_SAVING_DIR
    fname = os.path.basename(raw_path)
    if fname:
        for folder in [cfg.get("TEMP_FOLDER", ""), cfg.get("PERMANENT_SAVING_DIR", "")]:
            if folder:
                candidates.append(Path(folder) / fname)

    for p in candidates:
        try:
            if p.exists():
                return p
        except Exception:
            pass
    return None


def merge_compilation(nd_song_ids: List[str], album_artist: str = "Various Artists", job: Optional[Any] = None) -> int:
    import sqlite3
    from urllib.parse import unquote
    db_path = "/navidrome_data/navidrome.db"
    count = 0
    if not os.path.exists(db_path):
        return 0

    try:
        with sqlite3.connect(db_path, timeout=10) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()

            unified_album_name = ""

            for nd_id in nd_song_ids:
                cursor.execute("SELECT path, title, artist, album FROM media_file WHERE id = ?", (nd_id,))
                row = cursor.fetchone()
                if not row:
                    continue

                if not unified_album_name:
                    unified_album_name = row['album']

                raw_path = unquote(row['path'])
                abs_path = _resolve_nd_path(raw_path)

                if abs_path is not None:
                    apply_manual_tags_to_file(abs_path, {
                        "title": row['title'],
                        "artist": row['artist'],
                        "album": unified_album_name,
                        "album_artist": album_artist,
                        "compilation": True,
                    })
                    cursor.execute(
                        "UPDATE media_file SET album=?, album_artist=?, compilation=1, updated_at=CURRENT_TIMESTAMP WHERE id=?",
                        (unified_album_name, album_artist, nd_id),
                    )
                    count += 1
                    emit(f"Merged into compilation: {row['title']}", job=job)
                else:
                    emit(f"File not found (skipped): {raw_path}", level="warning", job=job)

            conn.commit()
    except Exception as e:
        emit(f"Error merging compilation: {e}", level="error", job=job)
        
    if count > 0:
        navidrome_rescan(job=job)
        
    return count
