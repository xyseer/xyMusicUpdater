import json
import queue
from django.conf import settings
from django.http import StreamingHttpResponse, HttpResponse
from django.views.decorators.csrf import csrf_exempt, ensure_csrf_cookie
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from ..models import Song
from ..logic import get_storage_info, _cfg, _get_safe_cfg, register_sse_listener, unregister_sse_listener
from .decorators import api_auth_required
@ensure_csrf_cookie
@api_view(["GET"])
@permission_classes([AllowAny])
def status_view(request):
    response_data = {
        "ekey": settings.SECRET_KEY[:16] # Public encryption key for login
    }
    
    if not request.user.is_authenticated:
        return Response(response_data)

    # Privileged data for authenticated users only
    info = get_storage_info()
    next_run = None
    try:
        from django.apps import apps
        scheduler = getattr(apps.get_app_config("core"), "_scheduler", None)
        if scheduler:
            job = scheduler.get_job("music_pipeline")
            if job:
                next_run = job.next_run_time
    except Exception:
        pass

    active_count = Song.objects.filter(status="active").count()
    deleted_count = Song.objects.filter(status="deleted").count()
    moved_count = Song.objects.filter(status="moved").count()

    response_data.update({
        "storage": info,
        "songs": {"active": active_count, "deleted": deleted_count, "moved": moved_count},
        "next_cron_run": next_run,
        "config": _get_safe_cfg()
    })

    return Response(response_data)


import time
@csrf_exempt
@api_auth_required
def sse_stream(request):
    def event_generator():
        # Yield first to ensure headers are sent immediately
        yield "data: {\"type\": \"connected\"}\n\n"
        
        q = queue.Queue()
        register_sse_listener(q)
        try:
            while True:
                try:
                    msg = q.get(timeout=25)
                    yield f"data: {msg}\n\n"
                except queue.Empty:
                    yield "data: {\"type\": \"ping\"}\n\n"
        except GeneratorExit:
            pass
        except Exception:
            pass
        finally:
            unregister_sse_listener(q)

    response = StreamingHttpResponse(event_generator(), content_type="text/event-stream")
    response["Cache-Control"] = "no-cache"
    response["X-Accel-Buffering"] = "no"
    return response
