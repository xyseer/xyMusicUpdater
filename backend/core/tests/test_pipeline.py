import pytest
import json
from pathlib import Path
from core.logic.pipeline import register_songs, retry_interrupted_jobs


# ── register_songs ────────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_register_songs_creates_record_for_new_file(tmp_path, mocker):
    from core.models import Song
    mp3 = tmp_path / "new_song.mp3"
    mp3.write_bytes(b"ID3" + b"\0" * 100)

    mocker.patch("core.logic.pipeline._read_basic_tags", return_value=("New Song", "Artist", "Album", "Artist"))
    mocker.patch("core.logic.pipeline.search_musicbrainz_api", return_value=[])

    result = register_songs([mp3], source="test")
    assert len(result) == 1
    assert Song.objects.filter(filename=mp3.name).exists()
    song = Song.objects.get(filename=mp3.name)
    assert song.status == "active"
    assert song.source == "test"


@pytest.mark.django_db
def test_register_songs_skips_nonexistent_file(tmp_path, mocker):
    from core.models import Song
    missing = tmp_path / "missing.mp3"
    result = register_songs([missing])
    assert result == []
    assert not Song.objects.filter(filename="missing.mp3").exists()


@pytest.mark.django_db
def test_register_songs_updates_existing_deleted_record(tmp_path, mocker):
    from core.models import Song
    mp3 = tmp_path / "existing.mp3"
    mp3.write_bytes(b"ID3" + b"\0" * 100)
    Song.objects.create(filename=mp3.name, filepath=str(mp3), status="deleted")

    mocker.patch("core.logic.pipeline._read_basic_tags", return_value=("Updated Title", "Artist", "Album", "Artist"))
    mocker.patch("core.logic.pipeline.search_musicbrainz_api", return_value=[])

    result = register_songs([mp3])
    assert len(result) == 1
    song = Song.objects.get(filename=mp3.name)
    assert song.status == "active"
    assert song.title == "Updated Title"


@pytest.mark.django_db
def test_register_songs_reads_video_id_sidecar(tmp_path, mocker):
    from core.models import Song
    mp3 = tmp_path / "with_id.mp3"
    mp3.write_bytes(b"ID3" + b"\0" * 100)
    vid = Path(str(mp3) + ".vid")
    vid.write_text("abc123XYZ", encoding="utf-8")

    mocker.patch("core.logic.pipeline._read_basic_tags", return_value=("", "", "", ""))
    mocker.patch("core.logic.pipeline.search_musicbrainz_api", return_value=[])

    register_songs([mp3])
    song = Song.objects.get(filename=mp3.name)
    assert song.video_id == "abc123XYZ"
    assert not vid.exists()  # sidecar must be removed after reading


@pytest.mark.django_db
def test_register_songs_uses_source_metadata_sidecar_without_online_matching(tmp_path, mocker):
    from core.models import Song
    mp3 = tmp_path / "sepia.mp3"
    mp3.write_bytes(b"ID3" + b"\0" * 100)
    meta = Path(str(mp3) + ".metadata.json")
    meta.write_text(json.dumps({
        "title": "sepia(Ver. Cristierra)",
        "artist": "shiki",
        "album": "sepia(Ver. Cristierra)",
        "album_artist": "shiki",
        "cover_url": "https://i1.sndcdn.com/artworks-test-t500x500.jpg",
    }), encoding="utf-8")

    mocker.patch("core.logic.pipeline._read_basic_tags", return_value=("", "", "", ""))
    fingerprint = mocker.patch("core.logic.pipeline.fingerprint_match", return_value=None)
    text_search = mocker.patch("core.logic.pipeline.search_musicbrainz_api", return_value=[])

    result = register_songs([mp3], source="manual")

    assert len(result) == 1
    song = Song.objects.get(filename=mp3.name)
    assert song.title == "sepia(Ver. Cristierra)"
    assert song.artist == "shiki"
    assert song.album == "sepia(Ver. Cristierra)"
    assert song.album_artist == "shiki"
    assert song.needs_tagging is False
    assert song.pending_confirmation is True
    assert not meta.exists()
    assert Path(str(mp3) + ".cover_url").read_text(encoding="utf-8") == "https://i1.sndcdn.com/artworks-test-t500x500.jpg"
    fingerprint.assert_not_called()
    text_search.assert_not_called()


@pytest.mark.django_db
def test_register_songs_auto_tag_with_high_confidence(tmp_path, mocker):
    from core.models import Song
    mp3 = tmp_path / "auto_tag.mp3"
    mp3.write_bytes(b"ID3" + b"\0" * 100)

    mocker.patch("core.logic.pipeline._read_basic_tags", return_value=("Bohemian Rhapsody", "", "", ""))
    mocker.patch("core.logic.pipeline.search_musicbrainz_api", return_value=[{
        "title": "Bohemian Rhapsody", "artist": "Queen",
        "album": "A Night at the Opera", "album_artist": "Queen",
        "cover_url": "",
    }])

    register_songs([mp3])
    song = Song.objects.get(filename=mp3.name)
    # >0.9 ratio → auto-tagged with pending_confirmation=True
    assert song.pending_confirmation is True
    assert song.needs_tagging is False


@pytest.mark.django_db
def test_register_songs_does_not_auto_tag_low_confidence(tmp_path, mocker):
    from core.models import Song
    mp3 = tmp_path / "low_conf.mp3"
    mp3.write_bytes(b"ID3" + b"\0" * 100)

    mocker.patch("core.logic.pipeline._read_basic_tags", return_value=("Random Title ABC", "", "", ""))
    mocker.patch("core.logic.pipeline.search_musicbrainz_api", return_value=[{
        "title": "Completely Different Song", "artist": "Other Artist",
        "album": "Other Album", "album_artist": "Other Artist",
        "cover_url": "",
    }])

    register_songs([mp3])
    song = Song.objects.get(filename=mp3.name)
    assert song.needs_tagging is True
    assert song.pending_confirmation is False


@pytest.mark.django_db
def test_register_songs_processes_multiple_files(tmp_path, mocker):
    from core.models import Song
    files = []
    for i in range(4):
        f = tmp_path / f"song_{i}.mp3"
        f.write_bytes(b"ID3" + b"\0" * 50)
        files.append(f)

    mocker.patch("core.logic.pipeline._read_basic_tags", return_value=("", "", "", ""))
    mocker.patch("core.logic.pipeline.search_musicbrainz_api", return_value=[])

    result = register_songs(files)
    assert len(result) == 4
    assert Song.objects.count() == 4


# ── retry_interrupted_jobs ────────────────────────────────────────────────────

@pytest.mark.django_db
def test_retry_interrupted_jobs_marks_running_as_failed():
    from core.models import DownloadJob
    running = DownloadJob.objects.create(job_type="cron", status="running")
    done = DownloadJob.objects.create(job_type="cron", status="done")
    queued = DownloadJob.objects.create(job_type="manual", status="queued")

    retry_interrupted_jobs()

    running.refresh_from_db()
    done.refresh_from_db()
    queued.refresh_from_db()

    assert running.status == "failed"
    assert running.error == "Interrupted"
    assert done.status == "done"
    assert queued.status == "queued"


@pytest.mark.django_db
def test_retry_interrupted_jobs_no_op_when_none_running():
    from core.models import DownloadJob
    DownloadJob.objects.create(job_type="cron", status="done")
    retry_interrupted_jobs()
    assert DownloadJob.objects.filter(status="failed").count() == 0
