from .decorators import api_auth_required
from django.apps import apps
from django.http import FileResponse, HttpResponse
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from pathlib import Path
import os
from ..models import SystemConfig
from ..logic import _cfg, _get_safe_cfg

ALLOWED_CONFIG_KEYS = [
    "HOLD_PERIOD_DAYS", 
    "MAX_DELETE_PER_PURGE", 
    "MONITORED_PLAYLISTS", 
    "MAX_SONGS_PER_SOURCE",
    "MAX_STORAGE_SIZE",
    "DAEMON_INTERVAL_HOURS",
    "NAVIDROME_URL",
    "NAVIDROME_USER",
    "NAVIDROME_PASSWORD",
    "YTDLP_COOKIES",
    "YTDLP_USERNAME",
    "YTDLP_PASSWORD",
    "YTDLP_PROXY",
    "DOWNLOAD_PROVIDER",
    "UI_DASHBOARD_BG",
    "UI_THEME_COLOR",
    "ALLOW_YTDLP",
    "API_TIMEOUT_SECONDS",
    "DEFAULT_PAGE_SIZE",
    "ACOUSTID_API_KEY",
    "DUPLICATE_THRESHOLD",
]

@api_auth_required
@api_view(["GET"])
def get_config_view(request):
    cfg = _get_safe_cfg()
    filtered_cfg = {k: v for k, v in cfg.items() if k in ALLOWED_CONFIG_KEYS}
    return Response(filtered_cfg)

@api_auth_required
@api_view(["POST"])
def update_config_view(request):
    for key, value in request.data.items():
        if key in ALLOWED_CONFIG_KEYS:
            if value == "********":
                continue
            SystemConfig.objects.update_or_create(key=key, defaults={"value": str(value)})
    
    try:
        apps.get_app_config("core").reload_scheduler()
    except Exception:
        pass

    cfg = _get_safe_cfg()
    filtered_cfg = {k: v for k, v in cfg.items() if k in ALLOWED_CONFIG_KEYS}
    return Response(filtered_cfg)

@api_auth_required
@api_view(["POST"])
def upload_background_view(request):
    if 'file' not in request.FILES:
        return Response({"error": "No file uploaded"}, status=400)
    
    file_obj = request.FILES['file']
    os.makedirs('/app/data', exist_ok=True)
    
    with open('/app/data/custom_bg', 'wb+') as f:
        for chunk in file_obj.chunks():
            f.write(chunk)
            
    return Response({"status": "ok"})

@api_view(["GET"])
@permission_classes([AllowAny])
def get_background_view(request):
    path = Path('/app/data/custom_bg')
    if path.exists():
        return FileResponse(open(path, 'rb'))
    
    # Return a default SVG if no custom background exists
    default_svg = """<svg width="200" height="200" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
      <rect width="200" height="200" fill="#0a0a0c"/>
      <path d="M0 0l200 200M200 0L0 200" stroke="#1c1c21" stroke-width="1" opacity="0.5"/>
    </svg>"""
    return HttpResponse(default_svg, content_type="image/svg+xml")
