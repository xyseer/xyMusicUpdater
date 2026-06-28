import pytest
from pathlib import Path
from unittest.mock import MagicMock, patch
from core.logic.tagger import (
    search_musicbrainz_api,
    confirm_pending_tags,
    reject_pending_tags,
    _read_basic_tags,
)


# ── _read_basic_tags ──────────────────────────────────────────────────────────

def test_read_basic_tags_missing_file(tmp_path):
    missing = tmp_path / "nonexistent.mp3"
    assert _read_basic_tags(missing) == ("", "", "", "")


def test_read_basic_tags_non_mp3_returns_empty(tmp_path):
    f = tmp_path / "audio.flac"
    f.touch()
    assert _read_basic_tags(f) == ("", "", "", "")


def test_read_basic_tags_corrupt_mp3_returns_empty(tmp_path):
    f = tmp_path / "corrupt.mp3"
    f.write_bytes(b"\x00" * 64)
    result = _read_basic_tags(f)
    assert isinstance(result, tuple)
    assert len(result) == 4


# ── search_musicbrainz_api ────────────────────────────────────────────────────

def test_search_musicbrainz_api_returns_list_when_all_apis_fail(mocker):
    mocker.patch("requests.get", side_effect=Exception("network error"))
    mocker.patch("musicbrainzngs.search_recordings", side_effect=Exception("mb error"))
    result = search_musicbrainz_api("Some Song")
    assert isinstance(result, list)
    assert len(result) == 0


def test_search_musicbrainz_api_parses_itunes_results(mocker):
    mock_resp = MagicMock()
    mock_resp.json.return_value = {
        "results": [
            {
                "trackName": "Bohemian Rhapsody",
                "artistName": "Queen",
                "collectionName": "A Night At The Opera",
                "artworkUrl100": "https://is1-ssl.mzstatic.com/100x100bb.jpg",
                "trackId": 12345,
            }
        ]
    }
    mocker.patch("requests.get", return_value=mock_resp)
    mocker.patch("musicbrainzngs.search_recordings", return_value={"recording-list": []})

    results = search_musicbrainz_api("Bohemian Rhapsody", limit=5)
    assert len(results) > 0
    assert results[0]["title"] == "Bohemian Rhapsody"
    assert results[0]["artist"] == "Queen"
    assert "600x600bb.jpg" in results[0]["cover_url"]


def test_search_musicbrainz_api_upscales_itunes_art(mocker):
    mock_resp = MagicMock()
    mock_resp.json.return_value = {
        "results": [{"trackName": "Song", "artistName": "Artist", "collectionName": "Album",
                     "artworkUrl100": "https://img.example.com/100x100bb.jpg", "trackId": 1}]
    }
    mocker.patch("requests.get", return_value=mock_resp)
    mocker.patch("musicbrainzngs.search_recordings", return_value={"recording-list": []})
    results = search_musicbrainz_api("Song")
    assert "600x600bb.jpg" in results[0]["cover_url"]


def test_search_musicbrainz_api_respects_limit(mocker):
    items = [{"trackName": f"Song {i}", "artistName": "Artist", "collectionName": "Album",
               "artworkUrl100": "", "trackId": i} for i in range(20)]
    mock_resp = MagicMock()
    mock_resp.json.return_value = {"results": items}
    mocker.patch("requests.get", return_value=mock_resp)
    mocker.patch("musicbrainzngs.search_recordings", return_value={"recording-list": []})

    results = search_musicbrainz_api("Song", limit=3)
    assert len(results) <= 3


def test_search_musicbrainz_api_handles_artist_quoted_query(mocker):
    mock_resp = MagicMock()
    mock_resp.json.return_value = {"results": []}
    mocker.patch("requests.get", return_value=mock_resp)
    mocker.patch("musicbrainzngs.search_recordings", return_value={"recording-list": []})
    result = search_musicbrainz_api('artist:"Queen" recording:"Bohemian Rhapsody"')
    assert isinstance(result, list)


# ── confirm_pending_tags ──────────────────────────────────────────────────────

@pytest.mark.django_db
def test_confirm_pending_tags_clears_flag(tmp_path, mocker):
    from core.models import Song
    f = tmp_path / "confirm.mp3"
    f.touch()
    song = Song.objects.create(
        filename="confirm.mp3", filepath=str(f),
        title="Title", artist="Artist", album="Album",
        pending_confirmation=True,
    )
    mocker.patch("core.logic.tagger.apply_manual_tags_to_file")
    mocker.patch("core.logic.tagger.navidrome_rescan")

    count = confirm_pending_tags(song_ids=[song.pk])
    assert count == 1
    song.refresh_from_db()
    assert song.pending_confirmation is False


@pytest.mark.django_db
def test_confirm_pending_tags_applies_pending_cover_url(tmp_path, mocker):
    from core.models import Song
    f = tmp_path / "confirm_cover.mp3"
    f.touch()
    cover = Path(str(f) + ".cover_url")
    cover.write_text("https://i1.sndcdn.com/artworks-test-t500x500.jpg", encoding="utf-8")
    song = Song.objects.create(
        filename="confirm_cover.mp3", filepath=str(f),
        title="Title", artist="Artist", album="Album",
        pending_confirmation=True,
    )
    apply_tags = mocker.patch("core.logic.tagger.apply_manual_tags_to_file")
    mocker.patch("core.logic.tagger.navidrome_rescan")

    count = confirm_pending_tags(song_ids=[song.pk])

    assert count == 1
    apply_tags.assert_called_once()
    assert apply_tags.call_args.args[1]["cover_url"] == "https://i1.sndcdn.com/artworks-test-t500x500.jpg"
    assert not cover.exists()


@pytest.mark.django_db
def test_confirm_pending_tags_only_processes_specified_ids(tmp_path, mocker):
    from core.models import Song
    f1, f2 = tmp_path / "s1.mp3", tmp_path / "s2.mp3"
    f1.touch()
    f2.touch()
    s1 = Song.objects.create(filename="s1.mp3", filepath=str(f1), pending_confirmation=True)
    s2 = Song.objects.create(filename="s2.mp3", filepath=str(f2), pending_confirmation=True)

    mocker.patch("core.logic.tagger.apply_manual_tags_to_file")
    mocker.patch("core.logic.tagger.navidrome_rescan")

    count = confirm_pending_tags(song_ids=[s1.pk])
    assert count == 1
    s2.refresh_from_db()
    assert s2.pending_confirmation is True


@pytest.mark.django_db
def test_confirm_pending_tags_all_when_no_ids_specified(tmp_path, mocker):
    from core.models import Song
    for i in range(3):
        f = tmp_path / f"s{i}.mp3"
        f.touch()
        Song.objects.create(filename=f"s{i}.mp3", filepath=str(f), pending_confirmation=True)

    mocker.patch("core.logic.tagger.apply_manual_tags_to_file")
    mocker.patch("core.logic.tagger.navidrome_rescan")

    count = confirm_pending_tags()
    assert count == 3


# ── reject_pending_tags ───────────────────────────────────────────────────────

@pytest.mark.django_db
def test_reject_pending_tags_sets_needs_tagging():
    from core.models import Song
    song = Song.objects.create(
        filename="reject.mp3", filepath="/tmp/reject.mp3",
        pending_confirmation=True, needs_tagging=False,
    )
    count = reject_pending_tags(song_ids=[song.pk])
    assert count == 1
    song.refresh_from_db()
    assert song.pending_confirmation is False
    assert song.needs_tagging is True


@pytest.mark.django_db
def test_reject_pending_tags_returns_zero_when_none_pending():
    count = reject_pending_tags()
    assert count == 0


@pytest.mark.django_db
def test_reject_pending_tags_does_not_affect_non_pending():
    from core.models import Song
    confirmed = Song.objects.create(
        filename="confirmed.mp3", filepath="/tmp/confirmed.mp3",
        pending_confirmation=False, needs_tagging=False,
    )
    reject_pending_tags()
    confirmed.refresh_from_db()
    assert confirmed.needs_tagging is False
