import json
import queue
import threading
import time
import traceback
from django.http import StreamingHttpResponse, JsonResponse, HttpResponse
from django.utils import timezone as dj_tz
from django.views.decorators.csrf import csrf_exempt
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .models import DownloadJob, Song, PermanentLog, SearchSubscription, SystemConfig
from .serializers import (DownloadJobSerializer, SongSerializer,
                           PermanentLogSerializer, SearchSubscriptionSerializer)

# ── Status ─────────────────────────────────────────────────────────────────

@api_view(["GET"])
def status_view(request):
    from .music_engine import get_storage_info, _cfg
    info = get_storage_info()
    next_run = None
    try:
        from django.apps import apps
        scheduler = getattr(apps.get_app_config("core"), "_scheduler", None)
        if scheduler:
            job = scheduler.get_job("music_pipeline")
            if job: next_run = job.next_run_time
    except Exception: pass

    active_count  = Song.objects.filter(status="active").count()
    deleted_count = Song.objects.filter(status="deleted").count()
    moved_count   = Song.objects.filter(status="moved").count()
    cfg = _cfg()

    return Response({
        "storage": info,
        "songs": {"active": active_count, "deleted": deleted_count, "moved": moved_count},
        "next_cron_run": next_run,
        "config": cfg,
    })

# ── Songs ──────────────────────────────────────────────────────────────────

@api_view(["GET"])
def songs_view(request):
    status_filter = request.query_params.get("status", "active")
    qs = Song.objects.all().order_by("-created_at")
    if status_filter == "pending":
        qs = qs.filter(pending_confirmation=True)
    elif status_filter:
        qs = qs.filter(status=status_filter)
    return Response(SongSerializer(qs, many=True).data)

@api_view(["POST"])
def confirm_tags_view(request):
    from .music_engine import confirm_pending_tags
    song_ids = request.data.get("ids", [])
    count = confirm_pending_tags(song_ids=song_ids)
    return Response({"status": "ok", "confirmed": count})

@api_view(["POST"])
def reject_tags_view(request):
    from .music_engine import reject_pending_tags
    song_ids = request.data.get("ids", [])
    count = reject_pending_tags(song_ids=song_ids)
    return Response({"status": "ok", "rejected": count})

@api_view(["GET"])
def playlist_map_view(request):
    from .music_engine import _get_playlist_track_map
    m = _get_playlist_track_map()
    # Convert sets to lists for JSON
    serializable_map = {k: list(v) for k, v in m.items()}
    return Response(serializable_map)

@api_view(["GET", "PATCH", "DELETE"])
def song_detail_view(request, pk):
    try:
        song = Song.objects.get(pk=pk)
    except Song.DoesNotExist:
        return Response({"error": "Not found"}, status=404)
        
    if request.method == "PATCH":
        from .music_engine import apply_manual_tags
        try:
            updated_song = apply_manual_tags(song, request.data)
            return Response(SongSerializer(updated_song).data)
        except Exception as e:
            return Response({"error": str(e)}, status=400)
            
    if request.method == "DELETE":
        from .music_engine import _delete_from_navidrome_db, navidrome_rescan
        from pathlib import Path
        path = Path(song.filepath)
        path.unlink(missing_ok=True)
        path.with_suffix(".info.json").unlink(missing_ok=True)
        _delete_from_navidrome_db(path)
        song.status = "deleted"; song.deleted_at = dj_tz.now(); song.needs_tagging = False; song.save()
        navidrome_rescan()
        return Response({"status": "deleted"})
    
    return Response(SongSerializer(song).data)

@api_view(["POST"])
def revert_song_view(request, pk):
    try:
        song = Song.objects.get(pk=pk)
    except Song.DoesNotExist: return Response({"error": "Not found"}, status=404)
    from .music_engine import revert_song_to_original
    try:
        revert_song_to_original(song)
        return Response({"status": "ok"})
    except Exception as e:
        return Response({"error": str(e)}, status=400)

def song_cover_view(request, pk):
    try:
        song = Song.objects.get(pk=pk)
    except Song.DoesNotExist: return HttpResponse(status=404)
    from pathlib import Path
    path = Path(song.filepath)
    if not path.exists(): return HttpResponse(status=404)
    ext = path.suffix.lower(); cover_data = None; mime_type = "image/jpeg"
    try:
        if ext == ".mp3":
            from mutagen.id3 import ID3; tags = ID3(path); apic = tags.getall("APIC")
            if apic: cover_data = apic[0].data; mime_type = apic[0].mime
        elif ext == ".flac":
            from mutagen.flac import FLAC; audio = FLAC(path)
            if audio.pictures: cover_data = audio.pictures[0].data; mime_type = audio.pictures[0].mime
        elif ext in {".m4a", ".mp4"}:
            from mutagen.mp4 import MP4; audio = MP4(path); covrs = audio.get("covr")
            if covrs: cover_data = bytes(covrs[0]); mime_type = "image/jpeg" if covrs[0].imageformat == 13 else "image/png"
    except Exception: pass
    if cover_data:
        return HttpResponse(cover_data, content_type=mime_type)
    return HttpResponse(status=404)

# ── Actions ────────────────────────────────────────────────────────────────

@api_view(["POST"])
def auto_tag_all_view(request):
    from .music_engine import auto_tag_all_untagged
    try:
        count = auto_tag_all_untagged()
        return Response({"status": "ok", "tagged": count})
    except Exception as e:
        return Response({"error": str(e)}, status=500)

@api_view(["GET", "POST", "PATCH", "DELETE"])
def subscriptions_view(request, pk=None):
    from django.apps import apps
    core_config = apps.get_app_config("core")
    
    if request.method == "GET":
        subs = SearchSubscription.objects.all().order_by("-created_at")
        return Response(SearchSubscriptionSerializer(subs, many=True).data)
    if request.method == "POST":
        serializer = SearchSubscriptionSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            core_config.reload_scheduler()
            return Response(serializer.data, status=201)
        return Response(serializer.errors, status=400)
    if request.method == "PATCH" and pk:
        try:
            sub = SearchSubscription.objects.get(pk=pk)
            serializer = SearchSubscriptionSerializer(sub, data=request.data, partial=True)
            if serializer.is_valid():
                serializer.save()
                core_config.reload_scheduler()
                return Response(serializer.data)
            return Response(serializer.errors, status=400)
        except SearchSubscription.DoesNotExist:
            return Response({"error": "Not found"}, status=404)
    if request.method == "DELETE" and pk:
        SearchSubscription.objects.filter(pk=pk).delete()
        core_config.reload_scheduler()
        return Response(status=204)
    return Response({"error": "Method not allowed"}, status=405)

@api_view(["POST"])
def run_subscriptions_view(request):
    from .music_engine import run_search_subscriptions
    from django.db import connection
    
    def _run_and_close():
        try:
            run_search_subscriptions(force=True)
        finally:
            connection.close()
            
    threading.Thread(target=_run_and_close, daemon=True).start()
    return Response({"status": "triggered"})

@api_view(["POST"])
def cleanup_history_view(request):
    from .music_engine import cleanup_deleted_history
    days = request.data.get("days")
    try:
        count = cleanup_deleted_history(days_override=int(days)) if days is not None else cleanup_deleted_history()
        return Response({"status": "ok", "cleaned": count})
    except Exception as e:
        return Response({"error": str(e)}, status=500)

# ── Jobs ───────────────────────────────────────────────────────────────────

@api_view(["GET"])
def jobs_list(request):
    jobs = DownloadJob.objects.all().order_by("-created_at")[:50]
    return Response(DownloadJobSerializer(jobs, many=True).data)

@api_view(["GET"])
def job_detail(request, pk):
    try:
        job = DownloadJob.objects.get(pk=pk)
        return Response(DownloadJobSerializer(job).data)
    except DownloadJob.DoesNotExist:
        return Response({"error": "Not found"}, status=404)

@api_view(["POST"])
def manual_download(request):
    url = request.data.get("url")
    allow_playlist = request.data.get("allow_playlist", False)
    override_duplicate = request.data.get("override_duplicate", False)
    if not url: return Response({"error": "URL required"}, status=400)
    job = DownloadJob.objects.create(job_type="manual", status="queued", created_at=dj_tz.now())
    threading.Thread(target=_run_manual_job, args=(job.id, url, allow_playlist, override_duplicate), daemon=True).start()
    return Response(DownloadJobSerializer(job).data, status=201)

@api_view(["GET"])
def search_media_view(request):
    q = request.query_params.get("q")
    if not q: return Response({"error": "Query required"}, status=400)
    from .music_engine import search_media
    try:
        results = search_media(q)
        return Response(results)
    except Exception as e:
        return Response({"error": str(e)}, status=500)

def _run_manual_job(job_id, url, allow_playlist, override_duplicate=False):
    from .music_engine import download_url, register_songs, navidrome_rescan
    try:
        job = DownloadJob.objects.get(pk=job_id)
        job.status = "running"; job.started_at = dj_tz.now(); job.save()
        files = download_url(url, job=job, allow_playlist=allow_playlist, override_duplicate=override_duplicate)
        if files:
            register_songs(files, source="manual", job=job)
            navidrome_rescan(job=job)
        job.status = "done"; job.finished_at = dj_tz.now(); job.save()
    except Exception as e:
        try:
            job = DownloadJob.objects.get(pk=job_id)
            job.status = "failed"; job.error = str(e); job.finished_at = dj_tz.now(); job.save()
        except Exception: pass

@api_view(["POST"])
def trigger_cron(request):
    from .tasks import scheduled_pipeline
    threading.Thread(target=scheduled_pipeline, daemon=True).start()
    return Response({"status": "triggered"})

@api_view(["POST"])
def rescan_view(request):
    from .music_engine import navidrome_rescan
    ok = navidrome_rescan(); return Response({"ok": ok})

@api_view(["POST"])
def purge_view(request):
    from .music_engine import purge_oldest_songs
    job = DownloadJob.objects.create(job_type="cron", status="running", started_at=dj_tz.now())
    try:
        purge_oldest_songs(job=job)
        job.status = "done"; job.finished_at = dj_tz.now(); job.save()
    except Exception as e:
        job.status = "failed"; job.error = str(e); job.finished_at = dj_tz.now(); job.save()
    return Response(DownloadJobSerializer(job).data)

@api_view(["GET"])
def playlists_view(request):
    from .music_engine import get_navidrome_playlists
    return Response(get_navidrome_playlists())

@api_view(["GET"])
def permanent_log_view(request):
    logs = PermanentLog.objects.select_related("song").order_by("-moved_at")[:50]
    return Response(PermanentLogSerializer(logs, many=True).data)

@api_view(["GET"])
def upcoming_purges_view(request):
    from .music_engine import get_upcoming_purges
    return Response(get_upcoming_purges())

ALLOWED_CONFIG_KEYS = [
    "HOLD_PERIOD_DAYS", 
    "MAX_DELETE_PER_PURGE", 
    "MONITORED_PLAYLISTS", 
    "MAX_SONGS_PER_SOURCE",
    "MAX_STORAGE_SIZE",
    "DAEMON_INTERVAL_HOURS",
    "NAVIDROME_USER",
    "NAVIDROME_PASSWORD",
    "YTDLP_COOKIES",
    "YTDLP_USERNAME",
    "YTDLP_PASSWORD",
    "YTDLP_PROXY"
]

@api_view(["GET"])
def get_config_view(request):
    from .music_engine import _cfg
    cfg = _cfg()
    filtered_cfg = {k: v for k, v in cfg.items() if k in ALLOWED_CONFIG_KEYS}
    if "NAVIDROME_PASSWORD" in filtered_cfg and filtered_cfg["NAVIDROME_PASSWORD"]:
        filtered_cfg["NAVIDROME_PASSWORD"] = "********"
    if "YTDLP_COOKIES" in filtered_cfg and filtered_cfg["YTDLP_COOKIES"]:
        filtered_cfg["YTDLP_COOKIES"] = "********"
    if "YTDLP_PASSWORD" in filtered_cfg and filtered_cfg["YTDLP_PASSWORD"]:
        filtered_cfg["YTDLP_PASSWORD"] = "********"
    return Response(filtered_cfg)

@api_view(["POST"])
def update_config_view(request):
    for key, value in request.data.items():
        if key in ALLOWED_CONFIG_KEYS:
            if value == "********": continue
            SystemConfig.objects.update_or_create(key=key, defaults={"value": str(value)})
    
    try:
        from django.apps import apps
        apps.get_app_config("core").reload_scheduler()
    except Exception: pass

    from .music_engine import _cfg
    cfg = _cfg()
    filtered_cfg = {k: v for k, v in cfg.items() if k in ALLOWED_CONFIG_KEYS}
    if "NAVIDROME_PASSWORD" in filtered_cfg and filtered_cfg["NAVIDROME_PASSWORD"]:
        filtered_cfg["NAVIDROME_PASSWORD"] = "********"
    if "YTDLP_COOKIES" in filtered_cfg and filtered_cfg["YTDLP_COOKIES"]:
        filtered_cfg["YTDLP_COOKIES"] = "********"
    if "YTDLP_PASSWORD" in filtered_cfg and filtered_cfg["YTDLP_PASSWORD"]:
        filtered_cfg["YTDLP_PASSWORD"] = "********"
    return Response(filtered_cfg)

@api_view(["GET"])
def search_musicbrainz_view(request):
    query = request.query_params.get("q", "")
    if not query: return Response([])
    from .music_engine import search_musicbrainz_api
    return Response(search_musicbrainz_api(query))

# ── Scheduler ──────────────────────────────────────────────────────────────

@api_view(["GET"])
def scheduler_info_view(request):
    from django.apps import apps
    from datetime import timedelta
    scheduler = getattr(apps.get_app_config("core"), "_scheduler", None)
    events = []
    if scheduler:
        now = dj_tz.now()
        horizon = now + timedelta(days=7)
        for job in scheduler.get_jobs():
            # Estimate future runs for interval triggers
            next_run = job.next_run_time
            while next_run and next_run < horizon:
                events.append({
                    "id": job.id,
                    "name": job.name,
                    "time": next_run.isoformat(),
                    "type": "pipeline" if job.id == "music_pipeline" else "discovery"
                })
                # For interval jobs, we can approximate the next one
                if hasattr(job.trigger, 'interval'):
                    next_run += job.trigger.interval
                else:
                    break # Only show one for non-interval or if we can't determine
        events.sort(key=lambda x: x["time"])
    return Response(events)

@api_view(["POST"])
def trigger_task_view(request):
    task_id = request.data.get("task_id")
    from .tasks import scheduled_pipeline
    from .music_engine import run_search_subscriptions
    import threading
    from django.db import connection
    
    def _run_pipeline():
        try: scheduled_pipeline()
        finally: connection.close()
        
    def _run_discovery():
        try: run_search_subscriptions(force=True)
        finally: connection.close()

    def _run_single_discovery(sid):
        from .music_engine import run_single_subscription, navidrome_rescan, purge_oldest_songs
        try:
            added = run_single_subscription(sid)
            if added and added > 0:
                navidrome_rescan()
                purge_oldest_songs()
        finally: connection.close()

    if task_id == "music_pipeline":
        threading.Thread(target=_run_pipeline, daemon=True).start()
        return Response({"status": "triggered", "task": "Music Pipeline"})
    elif task_id == "discovery_pipeline":
        threading.Thread(target=_run_discovery, daemon=True).start()
        return Response({"status": "triggered", "task": "Discovery Pipeline"})
    elif task_id and task_id.startswith("discovery_"):
        try:
            sub_id = int(task_id.split("_")[1])
            threading.Thread(target=_run_single_discovery, args=(sub_id,), daemon=True).start()
            return Response({"status": "triggered", "task": f"Discovery {sub_id}"})
        except (ValueError, IndexError):
            return Response({"error": "Invalid discovery ID"}, status=400)
    
    return Response({"error": "Unknown task"}, status=400)

# ── SSE stream ─────────────────────────────────────────────────────────────

@csrf_exempt
def sse_stream(request):
    from .music_engine import register_sse_listener, unregister_sse_listener
    import queue
    
    # Standard Python queue
    q = queue.Queue(maxsize=100)
    register_sse_listener(q)

    def event_generator():
        # First message to open the stream
        yield "event: ping\ndata: {}\n\n"
        try:
            while True:
                try:
                    # Non-blocking get with timeout to allow checking for disconnect
                    msg = q.get(timeout=20)
                    yield f"data: {msg}\n\n"
                except queue.Empty:
                    yield ": keepalive\n\n"
        except GeneratorExit:
            pass
        finally:
            unregister_sse_listener(q)

    response = StreamingHttpResponse(event_generator(), content_type="text/event-stream")
    response["Cache-Control"] = "no-cache"
    response["X-Accel-Buffering"] = "no"
    return response
