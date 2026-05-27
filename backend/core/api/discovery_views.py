from .decorators import api_auth_required
import threading
from django.db import connection
from django.apps import apps
from rest_framework.decorators import api_view
from rest_framework.response import Response
from ..models import SearchSubscription
from ..serializers import SearchSubscriptionSerializer
from ..logic import run_search_subscriptions

@api_auth_required
@api_view(["GET", "POST", "PATCH", "DELETE"])
def subscriptions_view(request, pk=None):
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

@api_auth_required
@api_view(["POST"])
def run_subscriptions_view(request):
    def _run_and_close():
        try:
            run_search_subscriptions(force=True)
        finally:
            connection.close()
            
    threading.Thread(target=_run_and_close, daemon=True).start()
    return Response({"status": "triggered"})
