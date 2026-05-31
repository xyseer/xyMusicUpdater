import json
import os
import re
import threading
from typing import Any, Dict, Optional
import difflib
from django.utils import timezone as dj_tz

# ── SSE Logging & Messaging ───────────────────────────────────────────────

_sse_listeners: list[Any] = []
_sse_lock = threading.Lock()

def register_sse_listener(q: Any) -> None:
    with _sse_lock:
        if q not in _sse_listeners:
            _sse_listeners.append(q)

def unregister_sse_listener(q: Any) -> None:
    with _sse_lock:
        if q in _sse_listeners:
            _sse_listeners.remove(q)

def _broadcast(data: Dict[str, Any]) -> None:
    msg = json.dumps(data)
    with _sse_lock:
        cur = list(_sse_listeners)
    for q in cur:
        try:
            q.put_nowait(msg)
        except Exception:
            unregister_sse_listener(q)

def emit(msg: str, job: Optional[Any] = None, level: str = "info", event_type: str = "log") -> None:
    from ..models import ActivityLog
    print(f"[{level.upper()}] {msg}")
    now_iso = dj_tz.now().isoformat()
    if job:
        try:
            ActivityLog.objects.create(job=job, message=msg, level=level)
        except Exception:
            pass
    _broadcast({"type": event_type, "message": msg, "level": level, "ts": now_iso})

# ── Configuration & Helpers ───────────────────────────────────────────────

def _cfg() -> Dict[str, Any]:
    from django.conf import settings
    from ..models import SystemConfig
    base_cfg = settings.MUSIC_CONFIG.copy()
    try:
        for item in SystemConfig.objects.all():
            base_cfg[item.key] = item.value
    except Exception:
        pass
    return base_cfg

def _get_safe_cfg() -> Dict[str, Any]:
    cfg = _cfg()
    for key in ["NAVIDROME_PASSWORD", "YTDLP_PASSWORD", "YTDLP_COOKIES", "ACOUSTID_API_KEY"]:
        if key in cfg and cfg[key]:
            cfg[key] = "********"
    return cfg

def _sanitize_filename(name: str) -> str:
    s = re.sub(r'[\\/*?:"<>|]', " ", name)
    s = re.sub(r'\s+', " ", s).strip()
    return s

def _score_title_match(query: str, candidate_title: str) -> float:
    """Multi-signal similarity between a (possibly messy) query and a clean candidate title.

    Cleans the query first, then checks containment → SequenceMatcher → word overlap.
    Returns 0.0–1.0.
    """
    cq = _clean_query(query).lower()
    ct = (candidate_title or '').lower().strip()
    if not cq or not ct:
        return 0.0
    if cq == ct:
        return 1.0
    if ct in cq or cq in ct:
        return 0.92
    base = difflib.SequenceMatcher(None, cq, ct).ratio()
    qw = set(cq.split())
    tw = set(ct.split())
    if qw and tw:
        overlap = len(qw & tw) / max(len(qw), len(tw))
        base = max(base, overlap * 0.88)
    return base

def _normalize_for_match(s: str) -> str:
    if not s:
        return ""
    base = os.path.splitext(s.lower())[0]
    return re.sub(r'[^\w\d]', '', base)

def _clean_query(s: str) -> str:
    """Strip YouTube/video-platform cruft so the core song title is searchable.

    Examples:
      「Realize」Music Video (Full size)  →  Realize
      ロストワンの号哭 feat. Kagamine Rin   →  ロストワンの号哭
      【HD】 六兆年と一夜物語 - KEMU VOXX   →  六兆年と一夜物語
    """
    if not s:
        return ""
    # Remove content inside Japanese full-width brackets (【】｛｝「」)
    s = re.sub(r'[【】｛｝].*?[【】｛｝]', ' ', s)
    s = re.sub(r'[「」]', ' ', s)
    # Remove common video-type suffixes anywhere in the string
    _VIDEO_SUFFIXES = (
        r'official\s*(mv|video|audio|music\s*video|lyric\s*video)?',
        r'music\s*video', r'\bmv\b', r'\bpv\b', r'\bshort\b',
        r'full\s*(ver\.?|version|size)?', r'lyrics?\s*(ver\.?)?',
        r'\bhd\b', r'\b4k\b', r'\bvideo\b',
        r'music clip', r'animation (pv|mv)',
    )
    for pat in _VIDEO_SUFFIXES:
        s = re.sub(r'[\(\[（\[]?' + pat + r'[\)\]）\]]?', ' ', s, flags=re.IGNORECASE)
    # Remove feat / ft collaborator info (search works better without it)
    s = re.sub(r'\s*(feat\.?|ft\.?)\s+[^\-\(（【\[]+', ' ', s, flags=re.IGNORECASE)
    # Remove parenthetical content that looks like metadata rather than the title itself
    s = re.sub(r'[\(（][^)）]{0,40}[\)）]', ' ', s)
    # Remove remaining bracket content
    s = re.sub(r'[\[\[｢][^\]】｣]{0,40}[\]\]｣]', ' ', s)
    # Strip leading channel/artist prefix separated by dash (e.g. "Neru - ロストワン")
    # Only strip if the right side is longer (i.e., the title is on the right)
    parts = re.split(r'\s[-–—]\s', s, maxsplit=1)
    if len(parts) == 2 and len(parts[1].strip()) >= len(parts[0].strip()):
        s = parts[1]
    return re.sub(r'\s+', ' ', s).strip()
