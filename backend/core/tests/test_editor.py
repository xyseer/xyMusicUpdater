import os
import time
import pytest
from pathlib import Path
from core.logic.editor import get_preview_dir, cleanup_previews, generate_trim_preview, finalize_trim


# ── get_preview_dir ───────────────────────────────────────────────────────────

def test_get_preview_dir_returns_path(mocker):
    mocker.patch("pathlib.Path.mkdir")
    p = get_preview_dir()
    assert isinstance(p, Path)


def test_get_preview_dir_creates_directory(tmp_path, mocker):
    target = tmp_path / "previews"
    mocker.patch("core.logic.editor.get_preview_dir", return_value=target)
    target.mkdir(parents=True, exist_ok=True)
    assert target.exists()


# ── cleanup_previews ──────────────────────────────────────────────────────────

def test_cleanup_previews_force_all_deletes_preview_files(tmp_path, mocker):
    mocker.patch("core.logic.editor.get_preview_dir", return_value=tmp_path)
    (tmp_path / "preview_001.mp3").touch()
    (tmp_path / "preview_002.mp3").touch()
    (tmp_path / "not_a_preview.mp3").touch()  # should NOT be deleted

    cleanup_previews(force_all=True)

    assert not (tmp_path / "preview_001.mp3").exists()
    assert not (tmp_path / "preview_002.mp3").exists()
    assert (tmp_path / "not_a_preview.mp3").exists()


def test_cleanup_previews_specific_path_only(tmp_path, mocker):
    mocker.patch("core.logic.editor.get_preview_dir", return_value=tmp_path)
    f1 = tmp_path / "preview_aaa.mp3"
    f2 = tmp_path / "preview_bbb.mp3"
    f1.touch()
    f2.touch()

    cleanup_previews(preview_path_str=str(f1))
    assert not f1.exists()
    assert f2.exists()


def test_cleanup_previews_ignores_paths_outside_preview_dir(tmp_path, mocker):
    preview_dir = tmp_path / "previews"
    preview_dir.mkdir()
    mocker.patch("core.logic.editor.get_preview_dir", return_value=preview_dir)

    outside = tmp_path / "outside.mp3"
    outside.touch()

    cleanup_previews(preview_path_str=str(outside))
    assert outside.exists()


def test_cleanup_previews_no_args_deletes_old_files(tmp_path, mocker):
    mocker.patch("core.logic.editor.get_preview_dir", return_value=tmp_path)

    old = tmp_path / "preview_old.mp3"
    fresh = tmp_path / "preview_fresh.mp3"
    old.touch()
    fresh.touch()

    # Make old file appear 2 hours ago
    old_time = time.time() - 7200
    os.utime(old, (old_time, old_time))

    cleanup_previews()
    assert not old.exists()
    assert fresh.exists()


def test_cleanup_previews_handles_empty_dir(tmp_path, mocker):
    mocker.patch("core.logic.editor.get_preview_dir", return_value=tmp_path)
    cleanup_previews(force_all=True)  # should not raise


# ── generate_trim_preview ─────────────────────────────────────────────────────

@pytest.mark.django_db
def test_generate_trim_preview_returns_none_for_missing_song():
    result = generate_trim_preview(99999, "0", "30")
    assert result is None


@pytest.mark.django_db
def test_generate_trim_preview_returns_none_for_missing_file(tmp_path, mocker):
    from core.models import Song
    song = Song.objects.create(
        filename="ghost.mp3",
        filepath=str(tmp_path / "ghost.mp3"),  # file does not exist
    )
    mocker.patch("core.logic.editor.cleanup_previews")
    result = generate_trim_preview(song.pk, "0", "30")
    assert result is None


@pytest.mark.django_db
def test_generate_trim_preview_returns_none_on_ffmpeg_failure(tmp_path, mocker):
    from core.models import Song
    mp3 = tmp_path / "real.mp3"
    mp3.write_bytes(b"\xff\xfb" + b"\0" * 100)
    song = Song.objects.create(filename="real.mp3", filepath=str(mp3))

    mocker.patch("core.logic.editor.get_preview_dir", return_value=tmp_path)
    mocker.patch("core.logic.editor.cleanup_previews")
    mocker.patch("subprocess.run", side_effect=Exception("ffmpeg not found"))

    result = generate_trim_preview(song.pk, "0", "30")
    assert result is None


# ── finalize_trim ─────────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_finalize_trim_returns_false_for_missing_song():
    result = finalize_trim(99999, "/tmp/fake_preview.mp3")
    assert result is False


@pytest.mark.django_db
def test_finalize_trim_returns_false_when_preview_missing(tmp_path):
    from core.models import Song
    original = tmp_path / "original.mp3"
    original.write_bytes(b"\xff\xfb" + b"\0" * 100)
    song = Song.objects.create(filename="original.mp3", filepath=str(original))

    result = finalize_trim(song.pk, str(tmp_path / "nonexistent_preview.mp3"))
    assert result is False


@pytest.mark.django_db
def test_finalize_trim_replaces_original_with_preview(tmp_path, mocker):
    from core.models import Song
    original = tmp_path / "original.mp3"
    original.write_bytes(b"ORIGINAL_DATA" + b"\0" * 100)
    preview = tmp_path / "preview_001.mp3"
    preview.write_bytes(b"TRIMMED_DATA" + b"\0" * 50)

    song = Song.objects.create(filename="original.mp3", filepath=str(original))
    mocker.patch("core.logic.editor.navidrome_rescan")

    result = finalize_trim(song.pk, str(preview))
    assert result is True
    assert original.read_bytes().startswith(b"TRIMMED_DATA")
    assert not preview.exists()


@pytest.mark.django_db
def test_finalize_trim_sets_needs_tagging_true(tmp_path, mocker):
    from core.models import Song
    original = tmp_path / "song.mp3"
    original.write_bytes(b"DATA" + b"\0" * 100)
    preview = tmp_path / "preview_trim.mp3"
    preview.write_bytes(b"TRIMMED" + b"\0" * 50)

    song = Song.objects.create(
        filename="song.mp3", filepath=str(original),
        needs_tagging=False, pending_confirmation=True,
    )
    mocker.patch("core.logic.editor.navidrome_rescan")

    finalize_trim(song.pk, str(preview))
    song.refresh_from_db()
    assert song.needs_tagging is True
    assert song.pending_confirmation is False
