import json
import re
import subprocess
import time
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional
from urllib.parse import quote_plus

import requests

from .utils import _cfg, emit, _sanitize_filename

_SC_HOST_RE = re.compile(r"https?://(?:www\.)?soundcloud\.com/", re.IGNORECASE)
_CLIENT_ID_RE = re.compile(r'client_id\s*[:=]\s*["\']([a-zA-Z0-9_-]{16,})["\']')
_ASSET_RE = re.compile(r'https://a-v2\.sndcdn\.com/assets/[^"\']+\.js')
_CLIENT_ID_CACHE: Dict[str, Any] = {"value": "", "ts": 0.0}
_COOLDOWN_UNTIL = 0.0


class SoundCloudError(Exception):
    pass


class SoundCloudRateLimited(SoundCloudError):
    pass


def is_soundcloud_source(source: str) -> bool:
    s = source or ""
    return s.startswith("scsearch") or bool(_SC_HOST_RE.search(s))


def _parse_scsearch(source: str) -> tuple[int, str]:
    match = re.match(r"scsearch(?:(\d+):)?(.+)", source or "", flags=re.IGNORECASE)
    if not match:
        return 10, source
    return int(match.group(1) or 10), match.group(2).strip()


def _raise_for_status(resp: requests.Response) -> None:
    if resp.status_code == 429:
        raise SoundCloudRateLimited("SoundCloud returned 429 Too Many Requests")
    if resp.status_code in (401, 403):
        raise SoundCloudError(f"SoundCloud denied access ({resp.status_code})")
    resp.raise_for_status()


def _request_json(session: requests.Session, url: str, params: Optional[Dict[str, Any]] = None, timeout: int = 20) -> Any:
    resp = session.get(url, params=params, timeout=timeout)
    _raise_for_status(resp)
    return resp.json()


def _soundcloud_session() -> requests.Session:
    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Referer": "https://soundcloud.com/",
    })
    proxy = _cfg().get("YTDLP_PROXY")
    if proxy:
        session.proxies.update({"http": proxy, "https": proxy})
    return session


def _get_client_id(session: requests.Session) -> str:
    cfg_id = (_cfg().get("SOUNDCLOUD_CLIENT_ID") or "").strip()
    if cfg_id:
        return cfg_id

    now = time.time()
    if _CLIENT_ID_CACHE["value"] and now - float(_CLIENT_ID_CACHE["ts"]) < 3600:
        return str(_CLIENT_ID_CACHE["value"])

    home = session.get("https://soundcloud.com/", timeout=20)
    _raise_for_status(home)
    asset_urls = list(dict.fromkeys(_ASSET_RE.findall(home.text)))
    direct = _CLIENT_ID_RE.search(home.text)
    if direct:
        _CLIENT_ID_CACHE.update({"value": direct.group(1), "ts": now})
        return direct.group(1)

    for asset_url in reversed(asset_urls[-12:]):
        js = session.get(asset_url, timeout=20)
        _raise_for_status(js)
        match = _CLIENT_ID_RE.search(js.text)
        if match:
            _CLIENT_ID_CACHE.update({"value": match.group(1), "ts": now})
            return match.group(1)

    raise SoundCloudError("Unable to discover SoundCloud client_id")


def _api_get(session: requests.Session, endpoint: str, params: Optional[Dict[str, Any]] = None) -> Any:
    client_id = _get_client_id(session)
    merged = dict(params or {})
    merged["client_id"] = client_id
    url = endpoint if endpoint.startswith("http") else f"https://api-v2.soundcloud.com{endpoint}"
    return _request_json(session, url, params=merged)


def _artwork_url(track: Dict[str, Any]) -> str:
    return (track.get("artwork_url") or track.get("user", {}).get("avatar_url") or "").replace("large.jpg", "t500x500.jpg")


def _track_metadata(track: Dict[str, Any]) -> Dict[str, str]:
    user = track.get("user") or {}
    publisher = track.get("publisher_metadata") or {}
    title = (track.get("title") or "").strip()
    artist = (
        publisher.get("artist")
        or track.get("label_name")
        or user.get("username")
        or ""
    ).strip()
    album = (
        publisher.get("album_title")
        or track.get("playlist_title")
        or title
    ).strip()
    return {
        "title": title,
        "artist": artist,
        "album": album or title,
        "album_artist": artist,
        "cover_url": _artwork_url(track),
    }


def _result_from_track(track: Dict[str, Any]) -> Dict[str, Any]:
    meta = _track_metadata(track)
    permalink = track.get("permalink_url") or ""
    return {
        "id": str(track.get("id") or ""),
        "title": meta["title"],
        "uploader": meta["artist"],
        "duration": int((track.get("duration") or 0) / 1000),
        "url": permalink,
        "thumbnail": meta.get("cover_url", ""),
    }


def search_soundcloud(query: str, limit: int = 10) -> List[Dict[str, Any]]:
    session = _soundcloud_session()
    data = _api_get(session, "/search/tracks", {
        "q": query,
        "limit": limit,
        "offset": 0,
        "linked_partitioning": 1,
    })
    return [_result_from_track(t) for t in data.get("collection", []) if t.get("permalink_url")]


def _resolve_source(session: requests.Session, source: str, limit: int, allow_playlist: bool) -> List[Dict[str, Any]]:
    if source.startswith("scsearch"):
        search_limit, query = _parse_scsearch(source)
        data = _api_get(session, "/search/tracks", {
            "q": query,
            "limit": min(max(search_limit, limit), 50),
            "offset": 0,
            "linked_partitioning": 1,
        })
        return [t for t in data.get("collection", []) if t.get("permalink_url")]

    resolved = _api_get(session, "/resolve", {"url": source})
    if resolved.get("kind") == "track":
        return [resolved]
    if resolved.get("kind") in {"playlist", "system-playlist"}:
        if not allow_playlist:
            return []
        tracks = resolved.get("tracks") or []
        full_tracks = []
        for track in tracks[:limit]:
            if track.get("media"):
                full_tracks.append(track)
            elif track.get("id"):
                try:
                    full_tracks.append(_api_get(session, f"/tracks/{track['id']}", {}))
                except Exception:
                    continue
        return full_tracks
    return []


def _pick_transcoding(track: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    transcodings = track.get("media", {}).get("transcodings") or []
    if not transcodings:
        return None
    progressive = [t for t in transcodings if t.get("format", {}).get("protocol") == "progressive"]
    hls = [t for t in transcodings if t.get("format", {}).get("protocol") == "hls"]
    preferred = progressive or hls or transcodings
    return sorted(preferred, key=lambda t: 0 if t.get("format", {}).get("mime_type") == "audio/mpeg" else 1)[0]


def _unique_output_path(dest: Path, title: str, track_id: str) -> Path:
    base = _sanitize_filename(title) or f"soundcloud_{track_id}"
    out = dest / f"{base}.mp3"
    if not out.exists():
        return out
    return dest / f"{base}_{track_id}.mp3"


def _download_with_ffmpeg(stream_url: str, out_path: Path, job: Optional[Any]) -> bool:
    tmp_out = out_path.with_suffix(".download.mp3")
    cmd = [
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        "-headers", "User-Agent: Mozilla/5.0\r\nReferer: https://soundcloud.com/\r\n",
        "-i", stream_url,
        "-vn", "-codec:a", "libmp3lame", "-q:a", "0",
        str(tmp_out),
    ]
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
        if res.returncode != 0:
            stderr = res.stderr.strip()
            if "429" in stderr or "Too Many Requests" in stderr:
                _set_cooldown()
            emit(f"SoundCloud ffmpeg failed: {stderr[:500]}", level="error", job=job)
            tmp_out.unlink(missing_ok=True)
            return False
        tmp_out.rename(out_path)
        return True
    except Exception as e:
        emit(f"SoundCloud ffmpeg execution failed: {e}", level="error", job=job)
        tmp_out.unlink(missing_ok=True)
        return False


def _write_sidecars(path: Path, track: Dict[str, Any]) -> None:
    track_id = str(track.get("id") or "")
    if track_id:
        Path(str(path) + ".vid").write_text(f"soundcloud:{track_id}", encoding="utf-8")
    meta = _track_metadata(track)
    Path(str(path) + ".metadata.json").write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
    if meta.get("artist"):
        Path(str(path) + ".uploader").write_text(meta["artist"], encoding="utf-8")


def _is_on_cooldown() -> bool:
    return time.time() < _COOLDOWN_UNTIL


def _set_cooldown(seconds: int = 900) -> None:
    global _COOLDOWN_UNTIL
    _COOLDOWN_UNTIL = time.time() + seconds


def download_soundcloud_source(
    source: str,
    dest: Path,
    max_items: int = 10,
    job: Optional[Any] = None,
    allow_playlist: bool = True,
    override_duplicate: bool = False,
    on_file_ready: Optional[Callable[[Path], None]] = None,
    keyword_blacklist: str = "",
    duplicate_checker: Optional[Callable[[str, str, str], bool]] = None,
    validator: Optional[Callable[[Path], bool]] = None,
) -> List[Path]:
    if _is_on_cooldown():
        emit("SoundCloud is cooling down after a rate limit; skipping this request.", level="warning", job=job)
        return []

    session = _soundcloud_session()
    blacklist_patterns = [p.strip().lower() for p in keyword_blacklist.split(",") if p.strip()]
    downloaded: List[Path] = []

    try:
        tracks = _resolve_source(session, source, max_items, allow_playlist)
    except SoundCloudRateLimited as e:
        _set_cooldown()
        emit(str(e), level="warning", job=job)
        return []
    except Exception as e:
        emit(f"SoundCloud resolve failed: {e}", level="error", job=job)
        return []

    if not tracks:
        emit("SoundCloud returned no downloadable tracks.", level="warning", job=job)
        return []

    emit(f"SoundCloud direct downloader found {len(tracks[:max_items])} candidate(s).", job=job)
    for track in tracks[:max_items]:
        meta = _track_metadata(track)
        title, artist = meta.get("title", ""), meta.get("artist", "")
        track_id = str(track.get("id") or "")
        if not title:
            continue
        if blacklist_patterns and any(p in title.lower() for p in blacklist_patterns):
            emit(f"Skipped (blacklisted): {title}", job=job)
            continue
        if not override_duplicate and duplicate_checker and duplicate_checker(title, artist, f"soundcloud:{track_id}"):
            emit(f"Skip Duplicate: {title}", job=job)
            continue

        transcoding = _pick_transcoding(track)
        if not transcoding:
            emit(f"SoundCloud track has no public stream: {title}", level="warning", job=job)
            continue

        try:
            stream_data = _api_get(session, transcoding["url"], {})
            stream_url = stream_data.get("url")
            if not stream_url:
                emit(f"SoundCloud stream URL missing: {title}", level="warning", job=job)
                continue
        except SoundCloudRateLimited as e:
            _set_cooldown()
            emit(str(e), level="warning", job=job)
            break
        except Exception as e:
            emit(f"SoundCloud stream resolve failed for {title}: {e}", level="error", job=job)
            continue

        out_path = _unique_output_path(dest, title, track_id)
        emit(f"SoundCloud downloading: {artist} - {title}", job=job)
        if not _download_with_ffmpeg(stream_url, out_path, job):
            continue
        if validator and not validator(out_path):
            emit(f"Corrupted SoundCloud file detected: {out_path.name}. Deleting.", level="error", job=job)
            out_path.unlink(missing_ok=True)
            continue

        _write_sidecars(out_path, track)
        downloaded.append(out_path)
        if on_file_ready:
            try:
                on_file_ready(out_path)
            except Exception as cb_err:
                emit(f"Post-download callback error for {out_path.name}: {cb_err}", level="warning", job=job)

    return downloaded
