import json, subprocess, os, uuid, threading
from collections import defaultdict
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
from urllib.parse import unquote
from .utils import _cfg, emit

_RESULTS_FILE = Path("/app/data/duplicates.json")
_scan_lock = threading.Lock()

DURATION_WINDOW = 30.0   # seconds — songs within this range are compared
FP_COMPARE_INTS = 120    # compare first 120 chromaprint ints (~5 s of audio)

def get_scan_state() -> Dict[str, Any]:
    if not _RESULTS_FILE.exists():
        return {"status": "idle", "scanned": 0, "total": 0, "fingerprinted": 0, "groups": []}
    try:
        state = json.loads(_RESULTS_FILE.read_text())
        # Stale "running" after container restart: lock is fresh (not held) but file says running.
        # Auto-recover so the user can start a new scan instead of getting 409 forever.
        if state.get("status") == "running" and not _scan_lock.locked():
            state["status"] = "error"
            _save_state(state)
        return state
    except Exception:
        return {"status": "idle", "scanned": 0, "total": 0, "fingerprinted": 0, "groups": []}

def _save_state(state: Dict[str, Any]) -> None:
    _RESULTS_FILE.parent.mkdir(parents=True, exist_ok=True)
    _RESULTS_FILE.write_text(json.dumps(state))

def _resolve_path(raw_path: str, nd_root: str) -> Optional[str]:
    """Try multiple strategies to locate the physical file."""
    decoded = unquote(raw_path)

    candidates = []
    # 1. As-is (absolute path stored in DB)
    if decoded.startswith("/"):
        candidates.append(decoded)
    # 2. Relative → under nd_root
    candidates.append(os.path.join(nd_root, decoded.lstrip("/")))
    # 3. Just the filename under nd_root (flat fallback)
    candidates.append(os.path.join(nd_root, Path(decoded).name))
    # 4. Under TEMP_FOLDER
    try:
        from .utils import _cfg as get_cfg
        cfg = get_cfg()
        candidates.append(os.path.join(cfg.get("TEMP_FOLDER", "/music/temp"), Path(decoded).name))
    except Exception:
        pass

    for c in candidates:
        if os.path.exists(c):
            return c
    return None

def _fpcalc(path: str) -> Tuple[float, List[int]]:
    try:
        r = subprocess.run(
            ["fpcalc", "-json", "-raw", path],
            capture_output=True, text=True, timeout=30,
        )
        if r.returncode != 0:
            return 0.0, []
        d = json.loads(r.stdout)
        fp = d.get("fingerprint", [])
        dur = float(d.get("duration", 0))
        # fpcalc -raw returns a list of ints; guard against str (non-raw mode)
        if fp and isinstance(fp[0], str):
            return dur, []
        return dur, fp
    except Exception:
        return 0.0, []

def _bit_error_rate(a: List[int], b: List[int], n: int) -> float:
    matching = sum(32 - bin(x ^ y).count('1') for x, y in zip(a[:n], b[:n]))
    return matching / (n * 32)

def _similarity(fp1: List[int], fp2: List[int]) -> float:
    """
    Sliding-window Chromaprint comparison.
    Tries ±MAX_OFFSET positions so intro/outro differences don't tank the score.
    Each fingerprint position ≈ 0.1238 s, so offset 40 ≈ 5 seconds of leeway.
    """
    n1, n2 = len(fp1), len(fp2)
    if min(n1, n2) < 20:
        return 0.0

    compare_len = min(min(n1, n2), FP_COMPARE_INTS)
    MAX_OFFSET = min(40, max(abs(n1 - n2), 0) + 20)  # up to ~5 s of offset

    best = 0.0
    for offset in range(-MAX_OFFSET, MAX_OFFSET + 1, 2):  # step 2 for speed
        if offset >= 0:
            chunk1 = fp1[offset:offset + compare_len]
            chunk2 = fp2[:len(chunk1)]
        else:
            chunk1 = fp1[:compare_len]
            chunk2 = fp2[(-offset):(-offset) + compare_len]

        n = min(len(chunk1), len(chunk2))
        if n < 20:
            continue
        sim = _bit_error_rate(chunk1, chunk2, n)
        if sim > best:
            best = sim
            if best >= 0.99:  # identical — no need to keep searching
                break

    return best

def scan_duplicates(job=None) -> None:
    if not _scan_lock.acquire(blocking=False):
        emit("Duplicate scan already running.", level="warning", job=job)
        return
    try:
        import sqlite3
        nd_db = "/navidrome_data/navidrome.db"
        if not os.path.exists(nd_db):
            emit("Navidrome DB not found at /navidrome_data/navidrome.db", level="error", job=job)
            return

        cfg = _cfg()
        nd_root = cfg.get("NAVIDROME_MUSIC_ROOT", "/music")
        threshold = float(cfg.get("DUPLICATE_THRESHOLD", 0.80))

        with sqlite3.connect(nd_db, timeout=10) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id, path, title, artist, duration FROM media_file WHERE missing=0")
            rows = cursor.fetchall()

        total = len(rows)
        emit(f"Found {total} tracks in Navidrome. Resolving paths + fingerprinting...", job=job)
        state: Dict[str, Any] = {"status": "running", "scanned": 0, "total": total, "fingerprinted": 0, "groups": []}
        _save_state(state)

        fingerprints: List[Dict] = []
        not_found = 0

        for i, (nd_id, raw_path, title, artist, db_dur) in enumerate(rows):
            file_path = _resolve_path(raw_path, nd_root)
            state["scanned"] = i + 1

            if not file_path:
                not_found += 1
                if not_found <= 3:
                    emit(f"File not found: {unquote(raw_path)!r} (nd_root={nd_root})", level="warning", job=job)
                continue

            dur, fp = _fpcalc(file_path)
            if fp:
                fingerprints.append({
                    "nd_id": nd_id, "path": file_path,
                    "title": title or "", "artist": artist or "",
                    "duration": dur or (db_dur or 0), "fp": fp,
                })
                state["fingerprinted"] = len(fingerprints)
            else:
                emit(f"fpcalc failed for: {Path(file_path).name}", level="warning", job=job)

            if (i + 1) % 10 == 0 or i + 1 == total:
                emit(f"Progress {i+1}/{total} — fingerprinted {len(fingerprints)}...", job=job)
                _save_state(state)

        if not fingerprints:
            emit(f"No files could be fingerprinted ({not_found}/{total} not found). Check NAVIDROME_MUSIC_ROOT config.", level="error", job=job)
            state["status"] = "done"
            state["groups"] = []
            _save_state(state)
            return

        emit(f"Fingerprinted {len(fingerprints)}/{total}. Comparing pairs...", job=job)
        fingerprints.sort(key=lambda x: x["duration"])

        # Union-Find
        parent = {x["nd_id"]: x["nd_id"] for x in fingerprints}

        def find(x: str) -> str:
            while parent[x] != x:
                parent[x] = parent[parent[x]]
                x = parent[x]
            return x

        def union(a: str, b: str) -> None:
            pa, pb = find(a), find(b)
            if pa != pb:
                parent[pa] = pb

        n = len(fingerprints)
        pairs_checked = 0
        for i in range(n):
            for j in range(i + 1, n):
                if fingerprints[j]["duration"] - fingerprints[i]["duration"] > DURATION_WINDOW:
                    break
                sim = _similarity(fingerprints[i]["fp"], fingerprints[j]["fp"])
                pairs_checked += 1
                if sim >= threshold:
                    union(fingerprints[i]["nd_id"], fingerprints[j]["nd_id"])

        emit(f"Checked {pairs_checked} pairs.", job=job)

        groups_map: Dict[str, List] = defaultdict(list)
        for item in fingerprints:
            groups_map[find(item["nd_id"])].append(item)

        groups = []
        for members in groups_map.values():
            if len(members) >= 2:
                groups.append({
                    "id": str(uuid.uuid4()),
                    "dismissed": False,
                    "songs": [
                        {"nd_id": m["nd_id"], "path": m["path"],
                         "title": m["title"], "artist": m["artist"],
                         "duration": round(m["duration"], 1)}
                        for m in members
                    ],
                })

        state["status"] = "done"
        state["groups"] = groups
        _save_state(state)
        emit(f"Scan complete. Found {len(groups)} duplicate group(s).", job=job)

    except Exception as e:
        import traceback
        st = get_scan_state()
        st["status"] = "error"
        _save_state(st)
        emit(f"Duplicate scan failed: {e}\n{traceback.format_exc()}", level="error", job=job)
    finally:
        _scan_lock.release()

def dismiss_group(group_id: str) -> bool:
    state = get_scan_state()
    for g in state.get("groups", []):
        if g["id"] == group_id:
            g["dismissed"] = True
            _save_state(state)
            return True
    return False

def delete_songs(nd_ids: List[str]) -> int:
    import sqlite3
    state = get_scan_state()
    path_map = {s["nd_id"]: s["path"] for g in state.get("groups", []) for s in g["songs"]}
    nd_db = "/navidrome_data/navidrome.db"

    deleted = 0

    for nd_id in nd_ids:
        file_path = path_map.get(nd_id)
        if file_path:
            p = Path(file_path)
            try:
                p.unlink(missing_ok=True)
            except Exception:
                pass
        if os.path.exists(nd_db):
            try:
                with sqlite3.connect(nd_db, timeout=10) as conn:
                    conn.execute("DELETE FROM media_file WHERE id = ?", (nd_id,))
                    conn.commit()
            except Exception:
                pass
        deleted += 1

    for g in state.get("groups", []):
        g["songs"] = [s for s in g["songs"] if s["nd_id"] not in nd_ids]
    state["groups"] = [g for g in state["groups"] if len(g["songs"]) >= 2]
    _save_state(state)
    return deleted
