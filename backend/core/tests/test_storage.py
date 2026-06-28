import os
import time
import pytest
from pathlib import Path
from unittest.mock import patch
from core.logic.storage import (
    get_storage_info,
    storage_is_full,
    get_upcoming_purges,
    cleanup_deleted_history,
    purge_oldest_songs,
)
from core.models import SystemConfig, Song


# ── get_storage_info ──────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_get_storage_info_counts_files(tmp_path):
    temp_dir = tmp_path / "temp"
    temp_dir.mkdir()
    (temp_dir / "song.mp3").write_bytes(b"\0" * (1024 * 1024))  # 1 MB

    SystemConfig.objects.update_or_create(key="TEMP_FOLDER", defaults={"value": str(temp_dir)})
    SystemConfig.objects.update_or_create(key="MAX_STORAGE_SIZE", defaults={"value": "1"})

    info = get_storage_info()
    assert info["used_bytes"] == 1024 * 1024
    assert info["total_gb"] == 1.0
    assert info["used_gb"] == pytest.approx(1 / 1024, abs=0.01)
    assert 0 < info["percent"] <= 100


@pytest.mark.django_db
def test_get_storage_info_empty_folder(tmp_path):
    temp_dir = tmp_path / "empty"
    temp_dir.mkdir()
    SystemConfig.objects.update_or_create(key="TEMP_FOLDER", defaults={"value": str(temp_dir)})
    SystemConfig.objects.update_or_create(key="MAX_STORAGE_SIZE", defaults={"value": "10"})

    info = get_storage_info()
    assert info["used_bytes"] == 0
    assert info["percent"] == 0.0


@pytest.mark.django_db
def test_get_storage_info_missing_folder(tmp_path):
    missing = tmp_path / "does_not_exist"
    SystemConfig.objects.update_or_create(key="TEMP_FOLDER", defaults={"value": str(missing)})
    SystemConfig.objects.update_or_create(key="MAX_STORAGE_SIZE", defaults={"value": "10"})

    info = get_storage_info()
    assert info["used_bytes"] == 0


@pytest.mark.django_db
def test_get_storage_info_recursively_counts_subdirs(tmp_path):
    temp_dir = tmp_path / "temp"
    sub = temp_dir / "sub"
    sub.mkdir(parents=True)
    (sub / "deep.mp3").write_bytes(b"\0" * 512)

    SystemConfig.objects.update_or_create(key="TEMP_FOLDER", defaults={"value": str(temp_dir)})
    SystemConfig.objects.update_or_create(key="MAX_STORAGE_SIZE", defaults={"value": "10"})

    info = get_storage_info()
    assert info["used_bytes"] == 512


# ── storage_is_full ───────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_storage_is_full_false_when_empty(tmp_path):
    temp_dir = tmp_path / "temp"
    temp_dir.mkdir()
    SystemConfig.objects.update_or_create(key="TEMP_FOLDER", defaults={"value": str(temp_dir)})
    SystemConfig.objects.update_or_create(key="MAX_STORAGE_SIZE", defaults={"value": "10"})
    assert storage_is_full() is False


# ── get_upcoming_purges ───────────────────────────────────────────────────────

@pytest.mark.django_db
def test_get_upcoming_purges_empty_when_folder_missing(tmp_path):
    missing = tmp_path / "nonexistent"
    SystemConfig.objects.update_or_create(key="TEMP_FOLDER", defaults={"value": str(missing)})
    result = get_upcoming_purges()
    assert result["candidates"] == []
    assert result["protected"] == []
    assert result["candidates_total"] == 0


@pytest.mark.django_db
def test_get_upcoming_purges_finds_old_files(tmp_path, mocker):
    temp_dir = tmp_path / "temp"
    temp_dir.mkdir()
    SystemConfig.objects.update_or_create(key="TEMP_FOLDER", defaults={"value": str(temp_dir)})
    SystemConfig.objects.update_or_create(key="HOLD_PERIOD_DAYS", defaults={"value": "0"})

    for i in range(3):
        f = temp_dir / f"old_song_{i}.mp3"
        f.touch()
        os.utime(f, (0, 0))  # epoch = definitely old

    mocker.patch("core.logic.storage._get_playlist_track_map", return_value={})
    result = get_upcoming_purges(candidates_page=1, page_size=10)
    assert result["candidates_total"] == 3
    assert len(result["candidates"]) == 3


@pytest.mark.django_db
def test_get_upcoming_purges_pagination(tmp_path, mocker):
    temp_dir = tmp_path / "temp"
    temp_dir.mkdir()
    SystemConfig.objects.update_or_create(key="TEMP_FOLDER", defaults={"value": str(temp_dir)})
    SystemConfig.objects.update_or_create(key="HOLD_PERIOD_DAYS", defaults={"value": "0"})

    for i in range(7):
        f = temp_dir / f"song_{i}.mp3"
        f.touch()
        os.utime(f, (0, 0))

    mocker.patch("core.logic.storage._get_playlist_track_map", return_value={})

    p1 = get_upcoming_purges(candidates_page=1, page_size=4)
    assert len(p1["candidates"]) == 4
    assert p1["candidates_total"] == 7

    p2 = get_upcoming_purges(candidates_page=2, page_size=4)
    assert len(p2["candidates"]) == 3


@pytest.mark.django_db
def test_get_upcoming_purges_skips_recent_files(tmp_path, mocker):
    temp_dir = tmp_path / "temp"
    temp_dir.mkdir()
    SystemConfig.objects.update_or_create(key="TEMP_FOLDER", defaults={"value": str(temp_dir)})
    SystemConfig.objects.update_or_create(key="HOLD_PERIOD_DAYS", defaults={"value": "30"})

    fresh = temp_dir / "fresh.mp3"
    fresh.touch()
    # mtime = now → will not be a candidate for 30-day hold

    mocker.patch("core.logic.storage._get_playlist_track_map", return_value={})
    result = get_upcoming_purges()
    assert result["candidates_total"] == 0


@pytest.mark.django_db
def test_get_upcoming_purges_protected_by_playlist(tmp_path, mocker):
    temp_dir = tmp_path / "temp"
    temp_dir.mkdir()
    SystemConfig.objects.update_or_create(key="TEMP_FOLDER", defaults={"value": str(temp_dir)})
    SystemConfig.objects.update_or_create(key="HOLD_PERIOD_DAYS", defaults={"value": "0"})
    SystemConfig.objects.update_or_create(key="MONITORED_PLAYLISTS", defaults={"value": "favorites"})

    old = temp_dir / "protected.mp3"
    old.touch()
    os.utime(old, (0, 0))

    mocker.patch(
        "core.logic.storage._get_playlist_track_map",
        return_value={"protected.mp3": {"favorites"}}
    )
    result = get_upcoming_purges()
    assert result["candidates_total"] == 0
    assert result["protected_total"] == 1


# ── cleanup_deleted_history ───────────────────────────────────────────────────

@pytest.mark.django_db
def test_cleanup_deleted_history_removes_old_records():
    from django.utils import timezone
    from datetime import timedelta

    old = Song.objects.create(
        filename="old_deleted.mp3",
        filepath="/tmp/old_deleted.mp3",
        status="deleted",
        deleted_at=timezone.now() - timedelta(days=60),
    )
    recent = Song.objects.create(
        filename="recent_deleted.mp3",
        filepath="/tmp/recent_deleted.mp3",
        status="deleted",
        deleted_at=timezone.now() - timedelta(days=1),
    )

    count = cleanup_deleted_history(days_override=30)
    assert count == 1
    assert not Song.objects.filter(pk=old.pk).exists()
    assert Song.objects.filter(pk=recent.pk).exists()


@pytest.mark.django_db
def test_cleanup_deleted_history_ignores_active_songs():
    from django.utils import timezone
    from datetime import timedelta

    active = Song.objects.create(
        filename="active.mp3",
        filepath="/tmp/active.mp3",
        status="active",
    )
    count = cleanup_deleted_history(days_override=0)
    assert Song.objects.filter(pk=active.pk).exists()


@pytest.mark.django_db
def test_cleanup_deleted_history_returns_zero_when_nothing_to_clean():
    count = cleanup_deleted_history(days_override=30)
    assert count == 0


# ── purge_oldest_songs ────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_purge_oldest_songs_deletes_old_unprotected_file(tmp_path, mocker):
    temp_dir = tmp_path / "temp"
    temp_dir.mkdir()
    perm_dir = tmp_path / "perm"
    perm_dir.mkdir()

    SystemConfig.objects.update_or_create(key="TEMP_FOLDER", defaults={"value": str(temp_dir)})
    SystemConfig.objects.update_or_create(key="PERMANENT_SAVING_DIR", defaults={"value": str(perm_dir)})
    SystemConfig.objects.update_or_create(key="HOLD_PERIOD_DAYS", defaults={"value": "0"})
    SystemConfig.objects.update_or_create(key="MAX_DELETE_PER_PURGE", defaults={"value": "10"})

    old_file = temp_dir / "old.mp3"
    old_file.touch()
    os.utime(old_file, (0, 0))

    mocker.patch("core.logic.storage._get_playlist_track_map", return_value={})
    mocker.patch("core.logic.storage._delete_from_navidrome_db")

    purge_oldest_songs()

    assert not old_file.exists()


@pytest.mark.django_db
def test_purge_oldest_songs_respects_quota(tmp_path, mocker):
    temp_dir = tmp_path / "temp"
    temp_dir.mkdir()
    perm_dir = tmp_path / "perm"
    perm_dir.mkdir()

    SystemConfig.objects.update_or_create(key="TEMP_FOLDER", defaults={"value": str(temp_dir)})
    SystemConfig.objects.update_or_create(key="PERMANENT_SAVING_DIR", defaults={"value": str(perm_dir)})
    SystemConfig.objects.update_or_create(key="HOLD_PERIOD_DAYS", defaults={"value": "0"})
    SystemConfig.objects.update_or_create(key="MAX_DELETE_PER_PURGE", defaults={"value": "2"})

    for i in range(5):
        f = temp_dir / f"old_{i}.mp3"
        f.touch()
        os.utime(f, (0, 0))

    mocker.patch("core.logic.storage._get_playlist_track_map", return_value={})
    mocker.patch("core.logic.storage._delete_from_navidrome_db")

    purge_oldest_songs()

    remaining = list(temp_dir.glob("*.mp3"))
    assert len(remaining) == 3  # quota=2 deleted, 3 remain
