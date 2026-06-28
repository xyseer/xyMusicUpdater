import os
import threading
from django.apps import AppConfig
from django.conf import settings

class CoreConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'core'
    _scheduler = None

    def ready(self):
        # Prevent starting during management commands
        import sys
        if 'manage.py' in sys.argv and any(cmd in sys.argv for cmd in ['migrate', 'makemigrations', 'collectstatic', 'test', 'shell']):
            return

        if os.environ.get('RUN_MAIN') == 'true' or not settings.DEBUG:
            threading.Thread(target=self.deferred_startup, daemon=True).start()

    def deferred_startup(self):
        """Startup logic that needs DB access, deferred to avoid RuntimeWarning."""
        import time
        import sqlite3
        import subprocess
        from django.db import connection
        
        # Wait a bit for DB to be ready/migrations to run if needed
        max_retries = 10
        for i in range(max_retries):
            try:
                if 'core_downloadjob' in connection.introspection.table_names():
                    break
            except Exception as e:
                # Automatic DB Reset if disk image is malformed (SQLite corruption)
                if 'malformed' in str(e).lower() or isinstance(e, sqlite3.DatabaseError):
                    print(f"CRITICAL: SQLite database corruption detected ({e}). Attempting automatic reset...")
                    db_path = settings.DATABASES['default']['NAME']
                    if os.path.exists(db_path):
                        os.remove(db_path)
                    print("Corrupted DB deleted. Running migrations to rebuild...")
                    subprocess.run(["python", "manage.py", "migrate", "--noinput"])
                    break # Migrations done, table should exist now
            time.sleep(2)
        else:
            return # Table not found after retries

        from .logic import retry_interrupted_jobs, cleanup_previews
        retry_interrupted_jobs()
        cleanup_previews(force_all=True) # Cleanup orphaned previews on boot
        self.start_scheduler()

    def start_scheduler(self):
        from apscheduler.schedulers.background import BackgroundScheduler
        from .tasks import scheduled_pipeline
        from .logic import run_single_subscription, _cfg, update_ytdlp
        from .models import SearchSubscription

        if self._scheduler:
            try:
                self._scheduler.shutdown()
            except: pass

        self._scheduler = BackgroundScheduler()
        cfg = _cfg()

        # 1. Main Pipeline (Cron)
        interval_main = int(cfg.get("DAEMON_INTERVAL_HOURS", 24))
        self._scheduler.add_job(
            scheduled_pipeline,
            'interval',
            hours=interval_main,
            id='music_pipeline',
            name='Main Music Pipeline',
            replace_existing=True
        )

        # 2. Individual Search Subscriptions
        subs = SearchSubscription.objects.filter(active=True)
        for sub in subs:
            self._scheduler.add_job(
                run_single_subscription,
                'interval',
                days=sub.cycle_days,
                id=f'discovery_{sub.id}',
                name=f'Discovery: {sub.label}',
                args=[sub.id],
                replace_existing=True
            )

        # 3. yt-dlp Auto-Update — every 30 days; stays ahead of yt-dlp's 90-day expiry
        self._scheduler.add_job(
            update_ytdlp,
            'interval',
            days=30,
            id='ytdlp_update',
            name='yt-dlp Auto-Update',
            replace_existing=True,
        )

        self._scheduler.start()

    def reload_scheduler(self):
        """Method to be called after updating SystemConfig."""
        self.start_scheduler()
