from .decorators import api_auth_required
import os
from pathlib import Path
from django.http import FileResponse, HttpResponse
from rest_framework.decorators import api_view
from rest_framework.response import Response
from ..models import Song
from ..logic import generate_trim_preview, finalize_trim, _cfg, cleanup_previews, get_preview_dir

@api_auth_required
@api_view(["POST"])
def cleanup_previews_view(request):
    preview_path = request.data.get("preview_path")
    cleanup_previews(preview_path)
    return Response({"status": "ok"})

@api_auth_required
@api_view(["GET"])
def stream_song_view(request, pk):
    preview_path_str = request.query_params.get("preview_path")
    if preview_path_str:
        path = Path(preview_path_str)
        allowed_prefix = get_preview_dir()
        try:
            path.resolve().relative_to(allowed_prefix.resolve())
        except ValueError:
            return HttpResponse("Forbidden", status=403)
    else:
        try:
            song = Song.objects.get(pk=pk)
            path = Path(song.filepath)
        except Song.DoesNotExist:
            return HttpResponse(status=404)
    
    if not path.exists():
        return HttpResponse(status=404)
        
    response = FileResponse(open(path, 'rb'))
    response['Content-Type'] = 'audio/mpeg'
    response['Accept-Ranges'] = 'bytes' # Explicitly signal range support
    return response

@api_auth_required
@api_view(["POST"])
def trim_song_view(request, pk):
    # This now just generates a preview
    start_time = request.data.get("start", "0")
    end_time = request.data.get("end", "0")
    
    preview_path = generate_trim_preview(pk, start_time, end_time)
    if preview_path:
        return Response({
            "status": "ok", 
            "preview_path": preview_path,
            "stream_url": f"/api/songs/{pk}/stream/?preview_path={preview_path}"
        })
    else:
        return Response({"status": "error", "message": "Failed to generate preview"}, status=500)

@api_auth_required
@api_view(["POST"])
def confirm_trim_view(request, pk):
    preview_path_str = request.data.get("preview_path")
    if not preview_path_str:
        return Response({"error": "No preview path provided"}, status=400)
    
    path = Path(preview_path_str)
    allowed_prefix = get_preview_dir()
    try:
        path.resolve().relative_to(allowed_prefix.resolve())
    except ValueError:
        return Response({"error": "Forbidden"}, status=403)
        
    success = finalize_trim(pk, preview_path_str)
    if success:
        return Response({"status": "ok"})
    else:
        return Response({"status": "error"}, status=500)
