import hashlib
import os
import platform
import re
import shutil
import signal
import ssl
import subprocess
import tempfile
import threading
import time
import urllib.request
from .utils import emit

_YTDLP_BIN = "/usr/local/bin/yt-dlp"
_RELEASE_BASE = "https://github.com/yt-dlp/yt-dlp/releases/latest/download"
# yt-dlp uses strict date-based versioning; anything else is suspicious
_VERSION_RE = re.compile(r"^\d{4}\.\d{2}\.\d{2}(\.\d+)?$")
# Validate a hex SHA-256 digest (64 lowercase hex chars)
_SHA256_RE = re.compile(r"^[0-9a-f]{64}$")


def update_ytdlp() -> None:
    """
    Pull the latest yt-dlp standalone binary from the official GitHub release,
    verify its SHA-256 against the published SHA2-256SUMS manifest, then
    atomically replace the binary only when verification passes.

    Security guarantees:
    - Downloads over HTTPS with system CA bundle (no cert bypass).
    - SHA-256 checksum fetched from the same GitHub release endpoint.
    - Binary is written to a temp file and hash-checked BEFORE it replaces
      the live binary; the live binary is never touched on a mismatch.
    - No pip / PyPI involved → no setup.py or wheel-script execution.
    - Version format is validated (must match YYYY.MM.DD).
    - New version must differ from current (no-op on same version).
    - Container restart only happens after a successful, verified upgrade.
    """
    emit("yt-dlp update check starting...")
    try:
        ver_before = _ytdlp_version()
        emit(f"yt-dlp current version: {ver_before}")

        # ── 1. Fetch the checksum manifest ─────────────────────────────────
        sums_url = f"{_RELEASE_BASE}/SHA2-256SUMS"
        emit("Fetching SHA2-256SUMS from GitHub release...")
        try:
            sums_text = _https_get(sums_url, timeout=30)
        except Exception as e:
            emit(f"Failed to fetch SHA2-256SUMS: {e}", level="error")
            return

        # ── 2. Parse expected hash for the correct arch's standalone binary ──
        bin_name = _ytdlp_bin_filename()
        emit(f"Detected platform: {platform.machine()} → downloading '{bin_name}'")
        expected_sha = _parse_sha256sum(sums_text, bin_name)
        if not expected_sha:
            emit(
                f"SECURITY: '{bin_name}' entry not found in SHA2-256SUMS — cannot verify integrity. Aborting.",
                level="error",
            )
            return

        # ── 3. Download binary to a temp file (never written to live path yet) ──
        bin_url = f"{_RELEASE_BASE}/{bin_name}"
        tmp_path = None
        try:
            with tempfile.NamedTemporaryFile(delete=False, dir="/tmp", prefix="yt-dlp-new-") as tmp:
                tmp_path = tmp.name

            emit("Downloading yt-dlp binary from GitHub release...")
            try:
                _https_download(bin_url, tmp_path, timeout=120)
            except Exception as e:
                emit(f"Binary download failed: {e}", level="error")
                return

            # ── 4. Verify SHA-256 before touching the live binary ───────────
            actual_sha = _sha256_file(tmp_path)
            if actual_sha != expected_sha:
                emit(
                    f"SECURITY ALERT: SHA-256 mismatch — "
                    f"expected {expected_sha[:16]}…, got {actual_sha[:16]}…  "
                    "Binary is NOT installed. Possible supply-chain tampering.",
                    level="error",
                )
                return

            # ── 5. Atomically replace the live binary (rename = atomic on Linux) ──
            os.chmod(tmp_path, 0o755)
            shutil.move(tmp_path, _YTDLP_BIN)
            tmp_path = None  # ownership transferred; skip cleanup

        finally:
            if tmp_path and os.path.exists(tmp_path):
                os.unlink(tmp_path)

        # ── 6. Post-install sanity: version must match expected format ──────
        ver_after = _ytdlp_version()
        if not _VERSION_RE.match(ver_after):
            emit(
                f"SECURITY: unexpected version string after update: {ver_after!r}. "
                "Container will NOT restart.",
                level="error",
            )
            return

        if ver_after != ver_before:
            emit(
                f"yt-dlp updated {ver_before} → {ver_after} (SHA-256 verified ✓). "
                "Container will restart in 5 s so the new binary is active for all future downloads.",
                level="info",
            )
            threading.Thread(target=_deferred_restart, daemon=True).start()
        else:
            emit(f"yt-dlp already up-to-date ({ver_after})")

    except Exception as exc:
        emit(f"yt-dlp update error: {exc}", level="error")


# ── helpers ────────────────────────────────────────────────────────────────────

def _ytdlp_bin_filename() -> str:
    """Return the yt-dlp GitHub release filename for the current platform."""
    machine = platform.machine().lower()
    if machine in ("aarch64", "arm64"):
        return "yt-dlp_linux_aarch64"
    if machine.startswith("armv7"):
        return "yt-dlp_linux_armv7l"
    return "yt-dlp"


def _ytdlp_version() -> str:
    try:
        r = subprocess.run(
            [_YTDLP_BIN, "--version"],
            capture_output=True, text=True, timeout=10,
        )
        v = r.stdout.strip()
        return v if r.returncode == 0 else "unknown"
    except Exception:
        return "unknown"


def _https_get(url: str, timeout: int = 30) -> str:
    """GET over HTTPS using the system CA bundle (no cert verification bypass)."""
    ctx = ssl.create_default_context()
    req = urllib.request.Request(
        url, headers={"User-Agent": "xyMusicUpdater/1 yt-dlp-updater"}
    )
    with urllib.request.urlopen(req, context=ctx, timeout=timeout) as resp:
        return resp.read().decode("utf-8")


def _https_download(url: str, dest: str, timeout: int = 120) -> None:
    """Stream-download url → dest over HTTPS with system CA verification."""
    ctx = ssl.create_default_context()
    req = urllib.request.Request(
        url, headers={"User-Agent": "xyMusicUpdater/1 yt-dlp-updater"}
    )
    with urllib.request.urlopen(req, context=ctx, timeout=timeout) as resp, \
            open(dest, "wb") as f:
        shutil.copyfileobj(resp, f)


def _parse_sha256sum(text: str, filename: str) -> str | None:
    """
    Parse GNU sha256sum output lines: '<hash>  <file>' or '<hash> *<file>'.
    Returns the lowercase hex digest, or None if not found.
    Rejects any line whose hash field is not exactly 64 hex characters.
    """
    for line in text.splitlines():
        parts = line.split(None, 1)
        if len(parts) != 2:
            continue
        digest, fname = parts[0].lower(), parts[1].lstrip("* ")
        if fname == filename and _SHA256_RE.match(digest):
            return digest
    return None


def _sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _deferred_restart() -> None:
    """SIGTERM → PID 1 (gunicorn master, placed there by `exec` in start.sh).
    Docker's restart=unless-stopped brings the container back immediately."""
    time.sleep(5)
    try:
        emit("Sending restart signal to container...")
        os.kill(1, signal.SIGTERM)
    except Exception as exc:
        emit(f"Container restart signal failed: {exc}", level="error")
