import os
import pytest
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from core.models import Song, SystemConfig, DownloadJob


# ── Helper ────────────────────────────────────────────────────────────────────

@pytest.fixture
def auth_client(db):
    """Authenticated APIClient using Django session (compatible with @api_auth_required)."""
    client = APIClient()
    user = User.objects.create_user(username="testuser", password="testpass")
    client.force_login(user)
    return client


@pytest.fixture
def anon_client():
    return APIClient()


# ── Auth endpoints ────────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_session_view_unauthenticated(anon_client):
    r = anon_client.get("/api/auth/session/")
    assert r.status_code == 200
    assert r.json()["authenticated"] is False


@pytest.mark.django_db
def test_session_view_authenticated(auth_client):
    r = auth_client.get("/api/auth/session/")
    assert r.status_code == 200
    assert r.json()["authenticated"] is True


@pytest.mark.django_db
def test_login_success(mocker):
    os.environ["APP_USER"] = "localadmin"
    os.environ["APP_PASSWORD"] = "localpass"
    mocker.patch("core.logic.cleanup_previews")
    client = APIClient()
    r = client.post("/api/auth/login/", {"username": "localadmin", "password": "localpass"}, format="json")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


@pytest.mark.django_db
def test_login_wrong_password():
    os.environ["APP_USER"] = "localadmin"
    os.environ["APP_PASSWORD"] = "correct"
    client = APIClient()
    r = client.post("/api/auth/login/", {"username": "localadmin", "password": "wrong"}, format="json")
    assert r.status_code == 401


@pytest.mark.django_db
def test_logout(auth_client):
    r = auth_client.post("/api/auth/logout/")
    assert r.status_code == 200


# ── songs_view ────────────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_songs_view_requires_auth(anon_client):
    r = anon_client.get("/api/songs/")
    assert r.status_code == 401


@pytest.mark.django_db
def test_songs_view_returns_active_by_default(auth_client):
    Song.objects.create(filename="a.mp3", filepath="/tmp/a.mp3", status="active")
    Song.objects.create(filename="b.mp3", filepath="/tmp/b.mp3", status="deleted")
    r = auth_client.get("/api/songs/")
    assert r.status_code == 200
    data = r.json()
    filenames = [s["filename"] for s in data["results"]]
    assert "a.mp3" in filenames
    assert "b.mp3" not in filenames


@pytest.mark.django_db
def test_songs_view_pagination(auth_client):
    for i in range(6):
        Song.objects.create(filename=f"song_{i}.mp3", filepath=f"/tmp/song_{i}.mp3")
    r = auth_client.get("/api/songs/", {"page": 1, "page_size": 4})
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 6
    assert len(data["results"]) == 4
    assert data["page"] == 1


@pytest.mark.django_db
def test_songs_view_page_2(auth_client):
    for i in range(6):
        Song.objects.create(filename=f"pg_{i}.mp3", filepath=f"/tmp/pg_{i}.mp3")
    r = auth_client.get("/api/songs/", {"page": 2, "page_size": 4})
    data = r.json()
    assert len(data["results"]) == 2


@pytest.mark.django_db
def test_songs_view_pending_filter(auth_client):
    Song.objects.create(filename="pending.mp3", filepath="/tmp/pending.mp3",
                        status="active", needs_tagging=True)
    Song.objects.create(filename="ready.mp3", filepath="/tmp/ready.mp3",
                        status="active", needs_tagging=False, pending_confirmation=False)
    r = auth_client.get("/api/songs/", {"status": "pending"})
    data = r.json()
    filenames = [s["filename"] for s in data["results"]]
    assert "pending.mp3" in filenames
    assert "ready.mp3" not in filenames


# ── song_detail_view ──────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_song_detail_view_get(auth_client):
    song = Song.objects.create(filename="detail.mp3", filepath="/tmp/detail.mp3")
    r = auth_client.get(f"/api/songs/{song.pk}/")
    assert r.status_code == 200
    assert r.json()["filename"] == "detail.mp3"


@pytest.mark.django_db
def test_song_detail_view_404_for_missing(auth_client):
    r = auth_client.get("/api/songs/99999/")
    assert r.status_code == 404


@pytest.mark.django_db
def test_song_detail_view_delete(auth_client, tmp_path, mocker):
    mp3 = tmp_path / "del.mp3"
    mp3.touch()
    song = Song.objects.create(filename="del.mp3", filepath=str(mp3))
    mocker.patch("core.api.song_views._delete_from_navidrome_db")
    mocker.patch("core.api.song_views.navidrome_rescan")
    r = auth_client.delete(f"/api/songs/{song.pk}/")
    assert r.status_code == 200
    song.refresh_from_db()
    assert song.status == "deleted"


# ── config views ──────────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_get_config_returns_200(auth_client):
    SystemConfig.objects.update_or_create(key="HOLD_PERIOD_DAYS", defaults={"value": "30"})
    r = auth_client.get("/api/config/")
    assert r.status_code == 200
    data = r.json()
    assert "HOLD_PERIOD_DAYS" in data


@pytest.mark.django_db
def test_get_config_requires_auth(anon_client):
    r = anon_client.get("/api/config/")
    assert r.status_code == 401


@pytest.mark.django_db
def test_update_config_persists_value(auth_client):
    r = auth_client.post("/api/config/update/", {"HOLD_PERIOD_DAYS": "45"}, format="json")
    assert r.status_code == 200
    assert SystemConfig.objects.filter(key="HOLD_PERIOD_DAYS", value="45").exists()


@pytest.mark.django_db
def test_update_config_skips_masked_value(auth_client):
    SystemConfig.objects.update_or_create(key="NAVIDROME_PASSWORD", defaults={"value": "original"})
    auth_client.post("/api/config/update/", {"NAVIDROME_PASSWORD": "********"}, format="json")
    assert SystemConfig.objects.get(key="NAVIDROME_PASSWORD").value == "original"


# ── upcoming purges ───────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_upcoming_purges_view_returns_200(auth_client, mocker):
    mocker.patch("core.logic.storage._get_playlist_track_map", return_value={})
    mocker.patch("core.logic.storage.get_upcoming_purges", return_value={
        "candidates": [], "protected": [],
        "candidates_total": 0, "protected_total": 0,
        "page": 1, "page_size": 50,
        "debug_info": {"monitored_playlists": "", "total_playlist_tracks": 0}
    })
    r = auth_client.get("/api/purge/upcoming/")
    assert r.status_code == 200
    data = r.json()
    assert "candidates" in data
    assert "protected" in data


@pytest.mark.django_db
def test_upcoming_purges_requires_auth(anon_client):
    r = anon_client.get("/api/purge/upcoming/")
    assert r.status_code == 401


# ── confirm / reject tags ─────────────────────────────────────────────────────

@pytest.mark.django_db
def test_confirm_tags_view(auth_client, tmp_path, mocker):
    f = tmp_path / "ct.mp3"
    f.touch()
    song = Song.objects.create(filename="ct.mp3", filepath=str(f), pending_confirmation=True)
    mocker.patch("core.logic.tagger.apply_manual_tags_to_file")
    mocker.patch("core.logic.tagger.navidrome_rescan")
    r = auth_client.post("/api/songs/confirm-tags/", {"ids": [song.pk]}, format="json")
    assert r.status_code == 200
    assert r.json()["confirmed"] == 1


@pytest.mark.django_db
def test_reject_tags_view(auth_client):
    song = Song.objects.create(filename="rj.mp3", filepath="/tmp/rj.mp3", pending_confirmation=True)
    r = auth_client.post("/api/songs/reject-tags/", {"ids": [song.pk]}, format="json")
    assert r.status_code == 200
    assert r.json()["rejected"] == 1
    song.refresh_from_db()
    assert song.needs_tagging is True


# ── cleanup history ───────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_cleanup_history_view(auth_client):
    r = auth_client.post("/api/songs/cleanup-history/", {"days": 0}, format="json")
    assert r.status_code == 200
    assert "count" in r.json()


# ── compilation ───────────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_compilation_candidates_view_returns_200(auth_client, mocker):
    mocker.patch("core.api.song_views.get_compilation_candidates", return_value={"results": [], "total": 0, "page": 1, "page_size": 50})
    r = auth_client.get("/api/compilation/candidates/")
    assert r.status_code == 200
    data = r.json()
    assert "results" in data
    assert data["total"] == 0


@pytest.mark.django_db
def test_merge_compilation_view_400_no_ids(auth_client):
    r = auth_client.post("/api/compilation/merge/", {"ids": []}, format="json")
    assert r.status_code == 400
