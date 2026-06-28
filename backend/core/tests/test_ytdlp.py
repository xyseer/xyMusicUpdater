import pytest
from pathlib import Path
from unittest.mock import MagicMock
from core.logic.ytdlp import (
    _is_valid_audio,
    _is_duplicate,
    _sanitize_ytdlp_out,
    _is_rate_limited,
    _metadata_from_entry,
    _ytdlp_download,
    search_media,
)


# ── _is_valid_audio ───────────────────────────────────────────────────────────

def test_is_valid_audio_returns_false_for_missing_file(tmp_path):
    assert _is_valid_audio(tmp_path / "nonexistent.mp3") is False


def test_is_valid_audio_returns_false_for_empty_file(tmp_path):
    f = tmp_path / "empty.mp3"
    f.touch()
    assert _is_valid_audio(f) is False


def test_is_valid_audio_returns_false_when_ffprobe_fails(tmp_path, mocker):
    f = tmp_path / "bad.mp3"
    f.write_bytes(b"\xff\xfb" + b"\0" * 100)
    mock = MagicMock()
    mock.returncode = 1
    mock.stdout = ""
    mocker.patch("subprocess.run", return_value=mock)
    assert _is_valid_audio(f) is False


def test_is_valid_audio_returns_true_when_ffprobe_succeeds(tmp_path, mocker):
    f = tmp_path / "good.mp3"
    f.write_bytes(b"\xff\xfb" + b"\0" * 100)
    mock = MagicMock()
    mock.returncode = 0
    mock.stdout = "180.456\n"
    mocker.patch("subprocess.run", return_value=mock)
    assert _is_valid_audio(f) is True


def test_is_valid_audio_returns_false_when_ffprobe_no_output(tmp_path, mocker):
    f = tmp_path / "no_duration.mp3"
    f.write_bytes(b"\xff\xfb" + b"\0" * 100)
    mock = MagicMock()
    mock.returncode = 0
    mock.stdout = "   "  # whitespace only
    mocker.patch("subprocess.run", return_value=mock)
    assert _is_valid_audio(f) is False


def test_is_valid_audio_handles_subprocess_exception(tmp_path, mocker):
    f = tmp_path / "err.mp3"
    f.write_bytes(b"\xff\xfb" + b"\0" * 100)
    mocker.patch("subprocess.run", side_effect=FileNotFoundError("ffprobe not found"))
    assert _is_valid_audio(f) is False


# ── _is_duplicate ─────────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_is_duplicate_by_video_id():
    from core.models import Song
    Song.objects.create(filename="vid.mp3", filepath="/tmp/vid.mp3", video_id="abc123")
    assert _is_duplicate("Any Title", video_id="abc123") is True


@pytest.mark.django_db
def test_is_duplicate_by_exact_title_and_artist():
    from core.models import Song
    Song.objects.create(filename="exact.mp3", filepath="/tmp/exact.mp3",
                        title="Exact Song", artist="Artist A")
    assert _is_duplicate("Exact Song", uploader="Artist A") is True


@pytest.mark.django_db
def test_is_duplicate_exact_title_match():
    from core.models import Song
    Song.objects.create(filename="t.mp3", filepath="/tmp/t.mp3", title="Some Song")
    assert _is_duplicate("some song") is True


@pytest.mark.django_db
def test_is_duplicate_returns_false_for_new_content():
    assert _is_duplicate("Brand New Unique Song Title 9999ZZQQ") is False


@pytest.mark.django_db
def test_is_duplicate_returns_false_for_empty_title():
    assert _is_duplicate("") is False


@pytest.mark.django_db
def test_is_duplicate_checks_deleted_songs_too():
    from core.models import Song
    Song.objects.create(filename="deleted.mp3", filepath="/tmp/deleted.mp3",
                        title="Old Deleted Song", status="deleted", video_id="del123")
    assert _is_duplicate("Old Deleted Song", video_id="del123") is True


# ── _sanitize_ytdlp_out ───────────────────────────────────────────────────────

def test_sanitize_ytdlp_out_masks_password():
    cfg = {"YTDLP_PASSWORD": "mysecret", "YTDLP_COOKIES": ""}
    text = "Downloading with --password=mysecret from https://example.com"
    result = _sanitize_ytdlp_out(text, cfg)
    assert "mysecret" not in result
    assert "********" in result


def test_sanitize_ytdlp_out_empty_text():
    cfg = {"YTDLP_PASSWORD": "x", "YTDLP_COOKIES": ""}
    assert _sanitize_ytdlp_out("", cfg) == ""


def test_sanitize_ytdlp_out_no_password_unchanged():
    cfg = {"YTDLP_PASSWORD": "", "YTDLP_COOKIES": ""}
    text = "Clean log output with no secrets"
    assert _sanitize_ytdlp_out(text, cfg) == text


def test_sanitize_ytdlp_out_masks_cookie_values():
    cookie_str = "domain\tTRUE\t/\tFALSE\t0\tSID\tabcdefghij"
    cfg = {"YTDLP_PASSWORD": "", "YTDLP_COOKIES": cookie_str}
    text = "Sending cookie SID=abcdefghij"
    result = _sanitize_ytdlp_out(text, cfg)
    assert "abcdefghij" not in result


def test_sanitize_ytdlp_out_short_cookie_values_not_masked():
    cookie_str = "domain\tTRUE\t/\tFALSE\t0\tSID\tok"  # value len <= 5
    cfg = {"YTDLP_PASSWORD": "", "YTDLP_COOKIES": cookie_str}
    text = "cookie value is ok"
    result = _sanitize_ytdlp_out(text, cfg)
    assert result == text  # short values are not masked


# ── SoundCloud metadata / rate limits ────────────────────────────────────────

def test_is_rate_limited_detects_429():
    assert _is_rate_limited("ERROR: HTTP Error 429: Too Many Requests") is True


def test_is_rate_limited_returns_false_for_regular_error():
    assert _is_rate_limited("ERROR: video unavailable") is False


def test_metadata_from_entry_prefers_track_artist_fields():
    entry = {
        "title": "shiki - sepia(Ver. Cristierra)",
        "track": "sepia(Ver. Cristierra)",
        "artist": "shiki",
        "uploader": "Someone Else",
    }

    assert _metadata_from_entry(entry) == {
        "title": "sepia(Ver. Cristierra)",
        "artist": "shiki",
        "album": "sepia(Ver. Cristierra)",
        "album_artist": "shiki",
    }


def test_search_media_soundcloud_uses_direct_client(mocker):
    sc_search = mocker.patch("core.logic.soundcloud.search_soundcloud", return_value=[{"title": "sepia"}])
    subprocess_run = mocker.patch("subprocess.run")

    assert search_media("shiki sepia", provider="soundcloud") == [{"title": "sepia"}]
    sc_search.assert_called_once_with("shiki sepia", limit=10)
    subprocess_run.assert_not_called()


def test_ytdlp_download_soundcloud_uses_direct_client(tmp_path, mocker):
    out = tmp_path / "sepia.mp3"
    sc_download = mocker.patch("core.logic.soundcloud.download_soundcloud_source", return_value=[out])
    subprocess_run = mocker.patch("subprocess.run")

    result = _ytdlp_download("https://soundcloud.com/shiki/sepia", tmp_path, "manual")

    assert result == [out]
    sc_download.assert_called_once()
    subprocess_run.assert_not_called()
