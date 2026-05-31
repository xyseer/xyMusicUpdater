from .decorators import api_auth_required
from rest_framework.decorators import api_view
from rest_framework.response import Response
from ..models import PermanentLog
from ..serializers import PermanentLogSerializer
from ..logic import navidrome_rescan, purge_oldest_songs, get_navidrome_playlists, get_upcoming_purges, _cfg

@api_auth_required
@api_view(["POST"])
def rescan_view(request):
    navidrome_rescan(full_scan=True)
    return Response({"status": "ok"})

@api_auth_required
@api_view(["POST"])
def purge_view(request):
    purge_oldest_songs()
    return Response({"status": "ok"})

@api_auth_required
@api_view(["GET"])
def playlists_view(request):
    return Response(get_navidrome_playlists())

@api_auth_required
@api_view(["GET"])
def permanent_log_view(request):
    logs = PermanentLog.objects.all().order_by("-moved_at")[:100]
    return Response(PermanentLogSerializer(logs, many=True).data)

@api_auth_required
@api_view(["GET"])
def upcoming_purges_view(request):
    try:
        page_size = int(request.query_params.get("page_size", _cfg().get("DEFAULT_PAGE_SIZE", 50)))
        candidates_page = int(request.query_params.get("candidates_page", 1))
        protected_page = int(request.query_params.get("protected_page", 1))
    except (ValueError, TypeError):
        page_size, candidates_page, protected_page = 50, 1, 1
    data = get_upcoming_purges(candidates_page=candidates_page, protected_page=protected_page, page_size=page_size)
    return Response(data)
