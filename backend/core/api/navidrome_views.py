from .decorators import api_auth_required
from rest_framework.decorators import api_view
from rest_framework.response import Response
from ..models import PermanentLog
from ..serializers import PermanentLogSerializer
from ..logic import navidrome_rescan, purge_oldest_songs, get_navidrome_playlists, get_upcoming_purges

@api_auth_required
@api_view(["POST"])
def rescan_view(request):
    navidrome_rescan()
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
    data = get_upcoming_purges()
    return Response(data)
