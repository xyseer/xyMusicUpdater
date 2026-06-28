from core.logic.soundcloud import (
    _result_from_track,
    _track_metadata,
    is_soundcloud_source,
)


def test_is_soundcloud_source_detects_url_and_scsearch():
    assert is_soundcloud_source("https://soundcloud.com/shiki/sepia") is True
    assert is_soundcloud_source("scsearch10:shiki sepia") is True
    assert is_soundcloud_source("ytsearch10:shiki sepia") is False


def test_track_metadata_prefers_publisher_artist():
    track = {
        "title": "sepia(Ver. Cristierra)",
        "publisher_metadata": {
            "artist": "shiki",
            "album_title": "sepia",
        },
        "user": {"username": "fallback user"},
        "artwork_url": "https://i1.sndcdn.com/artworks-test-large.jpg",
    }

    assert _track_metadata(track) == {
        "title": "sepia(Ver. Cristierra)",
        "artist": "shiki",
        "album": "sepia",
        "album_artist": "shiki",
        "cover_url": "https://i1.sndcdn.com/artworks-test-t500x500.jpg",
    }


def test_result_from_track_matches_frontend_shape():
    result = _result_from_track({
        "id": 123,
        "title": "sepia(Ver. Cristierra)",
        "duration": 125000,
        "permalink_url": "https://soundcloud.com/shiki/sepia",
        "user": {"username": "shiki"},
    })

    assert result["id"] == "123"
    assert result["title"] == "sepia(Ver. Cristierra)"
    assert result["uploader"] == "shiki"
    assert result["duration"] == 125
    assert result["url"] == "https://soundcloud.com/shiki/sepia"
