from .decorators import api_auth_required
import threading
from datetime import timedelta
from django.db import connection
from django.apps import apps
from django.utils import timezone as dj_tz
from rest_framework.decorators import api_view
from rest_framework.response import Response
from ..logic import run_pipeline, run_search_subscriptions, run_single_subscription, navidrome_rescan, purge_oldest_songs, update_ytdlp

_MAINTENANCE_JOB_IDS = {"ytdlp_update"}

@api_auth_required
@api_view(["GET"])
def scheduler_info_view(request):
    scheduler = getattr(apps.get_app_config("core"), "_scheduler", None)
    events = []
    maintenance_jobs = []

    if scheduler:
        now = dj_tz.now()
        horizon = now + timedelta(days=7)

        for job in scheduler.get_jobs():
            if job.id in _MAINTENANCE_JOB_IDS:
                # Expose maintenance jobs separately (may be far in the future)
                interval_days = None
                if hasattr(job.trigger, 'interval'):
                    interval_days = int(job.trigger.interval.total_seconds() // 86400)
                maintenance_jobs.append({
                    "id": job.id,
                    "name": job.name,
                    "next_run": job.next_run_time.isoformat() if job.next_run_time else None,
                    "interval_days": interval_days,
                })
                continue

            next_run = job.next_run_time
            while next_run and next_run < horizon:
                events.append({
                    "id": job.id,
                    "name": job.name,
                    "time": next_run.isoformat(),
                    "type": "pipeline" if job.id == "music_pipeline" else "discovery",
                })
                if hasattr(job.trigger, 'interval'):
                    next_run += job.trigger.interval
                else:
                    break

        events.sort(key=lambda x: x["time"])

    return Response({"events": events, "maintenance_jobs": maintenance_jobs})

@api_auth_required
@api_view(["POST"])
def trigger_task_view(request):
    task_id = request.data.get("task_id")
    
    def _run_pipeline():
        try:
            run_pipeline()
        finally:
            connection.close()

    def _run_discovery():
        try:
            run_search_subscriptions(force=True)
        finally:
            connection.close()

    def _run_single_discovery(sid):
        try:
            added = run_single_subscription(sid)
            if added and added > 0:
                navidrome_rescan()
                purge_oldest_songs()
        finally:
            connection.close()

    def _run_ytdlp_update():
        try:
            update_ytdlp()
        finally:
            connection.close()

    if task_id == "music_pipeline":
        threading.Thread(target=_run_pipeline, daemon=True).start()
        return Response({"status": "triggered", "task": "Music Pipeline"})
    elif task_id == "discovery_pipeline":
        threading.Thread(target=_run_discovery, daemon=True).start()
        return Response({"status": "triggered", "task": "Discovery Pipeline"})
    elif task_id == "ytdlp_update":
        threading.Thread(target=_run_ytdlp_update, daemon=True).start()
        return Response({"status": "triggered", "task": "yt-dlp Update"})
    elif task_id and task_id.startswith("discovery_"):
        try:
            sub_id = int(task_id.split("_")[1])
            threading.Thread(target=_run_single_discovery, args=(sub_id,), daemon=True).start()
            return Response({"status": "triggered", "task": f"Discovery {sub_id}"})
        except (ValueError, IndexError):
            return Response({"error": "Invalid discovery ID"}, status=400)

    return Response({"error": "Unknown task"}, status=400)

@api_auth_required
@api_view(["POST"])
def trigger_cron(request):
    threading.Thread(target=run_pipeline, daemon=True).start()
    return Response({"status": "triggered"})
