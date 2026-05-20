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

        try:
            from django.db import connection
            if 'core_downloadjob' not in connection.introspection.table_names():
                return
        except:
            return

        if os.environ.get('RUN_MAIN') == 'true' or not settings.DEBUG:
            from .music_engine import retry_interrupted_jobs
            retry_interrupted_jobs()
            self.start_scheduler()

    def start_scheduler(self):
        from apscheduler.schedulers.background import BackgroundScheduler
        from .tasks import scheduled_pipeline
        from .music_engine import run_search_subscriptions, _cfg
        
        if self._scheduler:
            self._scheduler.shutdown()

        self._scheduler = BackgroundScheduler()
        cfg = _cfg()
        
        # 1. Main Pipeline (Cron)
        # Default 6 hours
        interval_main = int(cfg.get("DAEMON_INTERVAL", 21600)) 
        self._scheduler.add_job(
            scheduled_pipeline, 
            'interval', 
            seconds=interval_main, 
            id='music_pipeline',
            replace_existing=True
        )

        # 2. Discovery Pipeline
        # Default 60 minutes
        interval_discovery = int(cfg.get("DISCOVERY_INTERVAL_MINS", 60))
        self._scheduler.add_job(
            run_search_subscriptions,
            'interval',
            minutes=interval_discovery,
            id='discovery_pipeline',
            replace_existing=True
        )

        self._scheduler.start()

    def reload_scheduler(self):
        """Method to be called after updating SystemConfig."""
        self.start_scheduler()
