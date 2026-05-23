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
        from .music_engine import run_single_subscription, _cfg
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

        self._scheduler.start()

    def reload_scheduler(self):
        """Method to be called after updating SystemConfig."""
        self.start_scheduler()
