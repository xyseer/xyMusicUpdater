import threading
from django.utils import timezone as dj_tz
from rest_framework.decorators import api_view
from rest_framework.response import Response
from .decorators import api_auth_required
from ..models import DownloadJob
from ..logic.duplicates import get_scan_state, scan_duplicates, dismiss_group, delete_songs, mark_not_duplicate

@api_auth_required
@api_view(["GET"])
def duplicates_status_view(request):
    state = get_scan_state()
    return Response({
        "status": state.get("status", "idle"),
        "scanned": state.get("scanned", 0),
        "total": state.get("total", 0),
        "fingerprinted": state.get("fingerprinted", 0),
        "group_count": sum(1 for g in state.get("groups", []) if not g.get("dismissed")),
    })

@api_auth_required
@api_view(["POST"])
def duplicates_scan_view(request):
    state = get_scan_state()
    if state.get("status") == "running":
        return Response({"error": "Scan already running"}, status=409)
    job = DownloadJob.objects.create(job_type="manual", status="running", created_at=dj_tz.now(), url="Duplicate Scan")

    def _run():
        from django.db import connection
        try:
            scan_duplicates(job=job)
            job.status = "done"
        except Exception as e:
            job.status = "failed"
            job.error = str(e)
        finally:
            job.finished_at = dj_tz.now()
            job.save()
            connection.close()

    threading.Thread(target=_run, daemon=True).start()
    return Response({"status": "started", "job_id": job.id})

@api_auth_required
@api_view(["GET"])
def duplicates_list_view(request):
    page = max(1, int(request.query_params.get("page", 1)))
    page_size = min(50, max(1, int(request.query_params.get("page_size", 10))))
    show_dismissed = request.query_params.get("show_dismissed", "false").lower() == "true"

    state = get_scan_state()
    groups = state.get("groups", [])
    if not show_dismissed:
        groups = [g for g in groups if not g.get("dismissed")]

    total = len(groups)
    start = (page - 1) * page_size
    page_groups = groups[start:start + page_size]

    return Response({
        "status": state.get("status", "idle"),
        "results": [{"id": g["id"], "dismissed": g.get("dismissed", False), "songs": g["songs"]} for g in page_groups],
        "total": total,
        "page": page,
        "page_size": page_size,
    })

@api_auth_required
@api_view(["POST"])
def duplicates_dismiss_view(request):
    group_id = request.data.get("group_id")
    if not group_id:
        return Response({"error": "group_id required"}, status=400)
    return Response({"ok": dismiss_group(group_id)})

@api_auth_required
@api_view(["POST"])
def duplicates_delete_view(request):
    nd_ids = request.data.get("nd_ids", [])
    if not nd_ids:
        return Response({"error": "nd_ids required"}, status=400)
    return Response({"deleted": delete_songs(nd_ids)})

@api_auth_required
@api_view(["POST"])
def duplicates_not_duplicate_view(request):
    nd_ids = request.data.get("nd_ids", [])
    if len(nd_ids) < 2:
        return Response({"error": "at least 2 nd_ids required"}, status=400)
    mark_not_duplicate(nd_ids)
    # Remove this group from the current scan state so it disappears immediately
    group_id = request.data.get("group_id")
    if group_id:
        dismiss_group(group_id)
    return Response({"ok": True})
