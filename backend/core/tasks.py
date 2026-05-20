from .music_engine import run_pipeline, cleanup_deleted_history
from .models import DownloadJob
from django.utils import timezone

def scheduled_pipeline():
    # 1. Cleanup old deleted records
    try:
        cleanup_deleted_history()
    except Exception:
        pass

    # 2. Run download pipeline
    job = DownloadJob.objects.create(
        job_type="cron", status="queued", created_at=timezone.now()
    )
    job.status = "running"
    job.started_at = timezone.now()
    job.save()
    try:
        run_pipeline(job=job)
        job.status = "done"
        job.finished_at = timezone.now()
        job.save()
    except Exception as e:
        job.status = "failed"
        job.error = str(e)
        job.finished_at = timezone.now()
        job.save()
