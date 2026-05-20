from django.test import TestCase, Client
from django.utils import timezone
from .models import Song, DownloadJob, SearchSubscription, SystemConfig, ActivityLog
from .music_engine import _get_playlist_track_map, purge_oldest_songs, _sanitize_filename, register_songs
import os
from pathlib import Path
import shutil

class MusicEngineTest(TestCase):
    def setUp(self):
        self.temp_dir = "/tmp/music_test_temp"
        self.perm_dir = "/tmp/music_test_perm"
        os.makedirs(self.temp_dir, exist_ok=True)
        os.makedirs(self.perm_dir, exist_ok=True)
        
        SystemConfig.objects.get_or_create(key="TEMP_FOLDER", value=self.temp_dir)
        SystemConfig.objects.get_or_create(key="PERMANENT_SAVING_DIR", value=self.perm_dir)
        SystemConfig.objects.get_or_create(key="MAX_STORAGE_SIZE", value="1000000")
        SystemConfig.objects.get_or_create(key="MAX_DELETE_PER_PURGE", value="10")
        SystemConfig.objects.get_or_create(key="HOLD_PERIOD_DAYS", value="0")

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)
        shutil.rmtree(self.perm_dir, ignore_errors=True)

    def test_sanitize_filename(self):
        self.assertEqual(_sanitize_filename('Artist / Title?'), 'Artist Title')
        self.assertEqual(_sanitize_filename('Song: "Cool"'), 'Song Cool')
        self.assertEqual(_sanitize_filename('Multiple    Spaces'), 'Multiple Spaces')

    def test_register_songs_with_job(self):
        # Create a dummy song file
        song_name = "test_song.mp3"
        song_path = os.path.join(self.temp_dir, song_name)
        with open(song_path, "w") as f:
            f.write("dummy content")
        
        job = DownloadJob.objects.create(job_type="manual", status="running")
        register_songs([Path(song_path)], source="test", job=job)
        
        # Verify song created
        song = Song.objects.get(filename=song_name)
        self.assertEqual(song.status, "active")
        
        # Verify job links
        self.assertEqual(job.songs_added.count(), 1)
        self.assertEqual(job.songs_added.first(), song)

    def test_activity_log_creation(self):
        from .music_engine import emit
        job = DownloadJob.objects.create(job_type="cron", status="running")
        emit("Testing log message", job=job)
        
        log = ActivityLog.objects.filter(job=job).first()
        self.assertIsNotNone(log)
        self.assertEqual(log.message, "Testing log message")

class ApiTest(TestCase):
    def setUp(self):
        self.client = Client()
        # Ensure config exists for API
        SystemConfig.objects.get_or_create(key="TEMP_FOLDER", value="/tmp")
        SystemConfig.objects.get_or_create(key="MAX_STORAGE_SIZE", value="1000")

    def test_status_endpoint(self):
        response = self.client.get('/api/status/')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn('storage', data)
        self.assertIn('songs', data)

    def test_playlist_map_endpoint(self):
        response = self.client.get('/api/songs/playlist-map/')
        self.assertEqual(response.status_code, 200)
        self.assertIsInstance(response.json(), dict)
