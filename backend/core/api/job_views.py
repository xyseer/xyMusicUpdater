from .decorators import api_auth_required
import threading
from django.db import connection
from django.utils import timezone as dj_tz
from rest_framework.decorators import api_view
from rest_framework.response import Response
from ..models import DownloadJob
from ..serializers import DownloadJobSerializer
from ..logic import search_media, download_url, navidrome_rescan

@api_auth_required
@api_view(["GET"])
def jobs_list(request):
    page = max(1, int(request.query_params.get("page", 1)))
    page_size = min(100, max(1, int(request.query_params.get("page_size", 20))))
    qs = DownloadJob.objects.all().order_by("-created_at")
    total = qs.count()
    jobs = qs[(page - 1) * page_size : page * page_size]
    return Response({"results": DownloadJobSerializer(jobs, many=True).data, "total": total, "page": page, "page_size": page_size})

@api_auth_required
@api_view(["GET"])
def job_detail(request, pk):
    try:
        job = DownloadJob.objects.get(pk=pk)
        return Response(DownloadJobSerializer(job).data)
    except DownloadJob.DoesNotExist:
        return Response({"error": "Not found"}, status=404)

@api_auth_required
@api_view(["POST"])
def manual_download(request):
    url = request.data.get("url")
    allow_playlist = request.data.get("allow_playlist", False)
    override_duplicate = request.data.get("override_duplicate", False)
    if not url:
        return Response({"error": "URL required"}, status=400)
    job = DownloadJob.objects.create(job_type="manual", status="queued", created_at=dj_tz.now())
    threading.Thread(target=_run_manual_job, args=(job.id, url, allow_playlist, override_duplicate), daemon=True).start()
    return Response(DownloadJobSerializer(job).data, status=201)

@api_auth_required
@api_view(["GET"])
def search_media_view(request):
    q = request.query_params.get("q")
    if not q:
        return Response({"error": "Query required"}, status=400)
    try:
        results = search_media(q)
        return Response(results)
    except Exception as e:
        return Response({"error": str(e)}, status=500)

def _run_manual_job(job_id, url, allow_playlist, override_duplicate=False):
    try:
        job = DownloadJob.objects.get(pk=job_id)
        job.status = "running"
        job.started_at = dj_tz.now()
        job.save()
        # download_url registers each song into DB immediately as it downloads.
        # One incremental rescan fires here after the whole job completes.
        files = download_url(url, job=job, allow_playlist=allow_playlist, override_duplicate=override_duplicate)
        if files:
            navidrome_rescan(job=job, full_scan=False)
        job.status = "done"
        job.finished_at = dj_tz.now()
        job.save()
    except Exception as e:
        try:
            job = DownloadJob.objects.get(pk=job_id)
            job.status = "failed"
            job.error = str(e)
            job.finished_at = dj_tz.now()
            job.save()
        except Exception:
            pass
    finally:
        connection.close()


_UPLOAD_ALLOWED_EXTS = {'.mp3', '.flac', '.m4a', '.opus', '.ogg', '.webm', '.wav'}

@api_auth_required
@api_view(["POST"])
def upload_songs_view(request):
    from pathlib import Path
    from ..logic import _cfg, emit
    files = request.FILES.getlist('files')
    if not files:
        return Response({"error": "No files provided"}, status=400)
    cfg = _cfg()
    temp = Path(cfg["TEMP_FOLDER"])
    temp.mkdir(parents=True, exist_ok=True)
    saved_paths = []
    for f in files:
        ext = Path(f.name).suffix.lower()
        if ext not in _UPLOAD_ALLOWED_EXTS:
            continue
        dest = temp / f.name
        if dest.exists():
            dest = temp / f"{dest.stem}_upload{ext}"
        with open(dest, 'wb+') as out:
            for chunk in f.chunks():
                out.write(chunk)
        saved_paths.append(str(dest))
    if not saved_paths:
        return Response({"error": "No valid audio files"}, status=400)
    job = DownloadJob.objects.create(
        job_type="manual", status="queued",
        created_at=dj_tz.now(), url=f"Upload: {len(saved_paths)} file(s)"
    )
    threading.Thread(target=_run_upload_job, args=(job.id, saved_paths), daemon=True).start()
    return Response(DownloadJobSerializer(job).data, status=201)


def _run_upload_job(job_id, file_paths):
    from pathlib import Path
    from ..logic import register_songs, emit
    try:
        job = DownloadJob.objects.get(pk=job_id)
        job.status, job.started_at = "running", dj_tz.now()
        job.save()
        paths = [Path(p) for p in file_paths]
        emit(f"Registering {len(paths)} uploaded file(s)...", job=job)
        register_songs(paths, source="upload", job=job)
        navidrome_rescan(job=job, full_scan=False)
        job.status, job.finished_at = "done", dj_tz.now()
        job.save()
        emit(f"Upload complete: {len(paths)} file(s) registered", job=job)
    except Exception as e:
        try:
            job = DownloadJob.objects.get(pk=job_id)
            job.status, job.error, job.finished_at = "failed", str(e), dj_tz.now()
            job.save()
        except Exception:
            pass
    finally:
        connection.close()
