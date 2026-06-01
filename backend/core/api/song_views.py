from .decorators import api_auth_required
from pathlib import Path
import os
from typing import Optional, Tuple
from django.http import HttpResponse
from django.utils import timezone as dj_tz
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticatedOrReadOnly, AllowAny
from rest_framework.response import Response
from ..models import Song
from ..serializers import SongSerializer
from ..logic import (
    confirm_pending_tags, reject_pending_tags, _get_playlist_track_map,
    apply_manual_tags, _delete_from_navidrome_db, navidrome_rescan,
    revert_song_to_original, auto_tag_all_untagged, cleanup_deleted_history,
    search_musicbrainz_api, get_compilation_candidates, merge_compilation,
    ignore_compilation_songs, _cfg
)

@api_auth_required
@api_view(["GET"])
def compilation_candidates_view(request):
    try:
        page = int(request.query_params.get("page", 1))
        page_size = int(request.query_params.get("page_size", _cfg().get("DEFAULT_PAGE_SIZE", 50)))
    except (ValueError, TypeError):
        page, page_size = 1, 50
    return Response(get_compilation_candidates(page=page, page_size=page_size))

@api_auth_required
@api_view(["POST"])
def merge_compilation_view(request):
    nd_song_ids = request.data.get("ids", [])
    if not nd_song_ids:
        return Response({"error": "No IDs provided"}, status=400)
    album_artist = (request.data.get("album_artist") or "Various Artists").strip() or "Various Artists"
    count = merge_compilation(nd_song_ids, album_artist=album_artist)
    return Response({"status": "ok", "merged": count})

@api_auth_required
@api_view(["POST"])
def ignore_compilation_view(request):
    nd_ids = request.data.get("ids", [])
    if not nd_ids:
        return Response({"error": "No IDs provided"}, status=400)
    ignore_compilation_songs(nd_ids)
    return Response({"status": "ok", "ignored": len(nd_ids)})

def _extract_cover_from_path(abs_path: Path) -> tuple[Optional[bytes], str]:
    if not abs_path.exists():
        return None, ""
    cover_data, mime_type = None, "image/jpeg"
    try:
        if abs_path.suffix.lower() == ".mp3":
            from mutagen.id3 import ID3, ID3NoHeaderError
            try:
                tags = ID3(abs_path)
                for key in tags.keys():
                    if key.startswith("APIC"):
                        cover_data, mime_type = tags[key].data, tags[key].mime
                        return cover_data, mime_type
            except ID3NoHeaderError: pass
        from mutagen import File
        audio = File(abs_path)
        if audio and hasattr(audio, 'pictures') and audio.pictures:
            cover_data, mime_type = audio.pictures[0].data, audio.pictures[0].mime
            return cover_data, mime_type
    except Exception as e:
        print(f"ERROR: Cover extraction failed for {abs_path}: {e}")
    return None, ""

@api_auth_required
def nd_song_cover_view(request, nd_id):
    import sqlite3
    from urllib.parse import unquote
    db_path = "/navidrome_data/navidrome.db"
    if not os.path.exists(db_path): return HttpResponse(status=404)
    path_str = ""
    try:
        with sqlite3.connect(db_path, timeout=5) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT path FROM media_file WHERE id = ?", (nd_id,))
            row = cursor.fetchone()
            if row: path_str = unquote(row[0])
    except: return HttpResponse(status=404)
    if not path_str: return HttpResponse(status=404)
    variations = [Path("/music") / path_str, Path("/music") / unquote(path_str), Path(path_str) if path_str.startswith("/") else None]
    abs_path = None
    for v in variations:
        if v and v.exists():
            abs_path = v
            break
    if not abs_path:
        fname = os.path.basename(path_str)
        for folder in ["temp", "permanent"]:
            p = Path("/music") / folder / fname
            if p.exists(): abs_path = p; break
    if not abs_path: return HttpResponse(status=404)
    data, mime = _extract_cover_from_path(abs_path)
    if data: return HttpResponse(data, content_type=mime)
    return HttpResponse(status=404)

@api_auth_required
@api_view(["GET"])
def songs_view(request):
    status_filter = request.query_params.get("status", "active")
    try:
        page = int(request.query_params.get("page", 1))
        page_size = int(request.query_params.get("page_size", _cfg().get("DEFAULT_PAGE_SIZE", 50)))
    except (ValueError, TypeError):
        page, page_size = 1, 50

    qs = Song.objects.all().order_by("-created_at")
    if status_filter == "pending":
        from django.db.models import Q
        qs = qs.filter(Q(needs_tagging=True) | Q(pending_confirmation=True)).filter(status="active")
    elif status_filter:
        qs = qs.filter(status=status_filter)
    
    total = qs.count()
    start = (page - 1) * page_size
    end = start + page_size
    
    results = qs[start:end]
    return Response({
        "results": SongSerializer(results, many=True).data,
        "total": total,
        "page": page,
        "page_size": page_size
    })

@api_auth_required
@api_view(["POST"])
def confirm_tags_view(request):
    song_ids = request.data.get("ids", [])
    count = confirm_pending_tags(song_ids=song_ids)
    return Response({"status": "ok", "confirmed": count})

@api_auth_required
@api_view(["POST"])
def reject_tags_view(request):
    song_ids = request.data.get("ids", [])
    count = reject_pending_tags(song_ids=song_ids)
    return Response({"status": "ok", "rejected": count})

@api_auth_required
@api_view(["GET"])
def playlist_map_view(request):
    m = _get_playlist_track_map()
    serializable_map = {k: list(v) for k, v in m.items()}
    return Response(serializable_map)

@api_auth_required
@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([IsAuthenticatedOrReadOnly])
def song_detail_view(request, pk):
    try: song = Song.objects.get(pk=pk)
    except: return Response({"error": "Not found"}, status=404)
    if request.method == "PATCH":
        try:
            updated_song = apply_manual_tags(song, request.data)
            return Response(SongSerializer(updated_song).data)
        except Exception as e: return Response({"error": str(e)}, status=400)
    if request.method == "DELETE":
        path = Path(song.filepath)
        path.unlink(missing_ok=True)
        path.with_suffix(".info.json").unlink(missing_ok=True)
        _delete_from_navidrome_db(path)
        song.status, song.deleted_at, song.needs_tagging = "deleted", dj_tz.now(), False
        song.save()
        navidrome_rescan()
        return Response({"status": "deleted"})
    return Response(SongSerializer(song).data)

@api_auth_required
@api_view(["POST"])
def revert_song_view(request, pk):
    try: song = Song.objects.get(pk=pk)
    except: return Response({"error": "Not found"}, status=404)
    try:
        revert_song_to_original(song)
        return Response({"status": "ok"})
    except Exception as e: return Response({"error": str(e)}, status=400)

@api_auth_required
def song_cover_view(request, pk):
    try: song = Song.objects.get(pk=pk)
    except: return HttpResponse(status=404)
    data, mime = _extract_cover_from_path(Path(song.filepath))
    if data: return HttpResponse(data, content_type=mime)
    return HttpResponse(status=404)

@api_auth_required
@api_view(["POST"])
def auto_tag_all_view(request):
    count = auto_tag_all_untagged()
    return Response({"status": "ok", "tagged": count})

@api_auth_required
@api_view(["PATCH"])
def stage_tags_view(request, pk):
    """Update song metadata in DB only — does NOT write to the audio file.
    Used by the frontend auto-tagger to stage suggestions for user confirmation."""
    try:
        song = Song.objects.get(pk=pk)
    except Song.DoesNotExist:
        return Response({"error": "Not found"}, status=404)
    allowed = {"title", "artist", "album", "album_artist", "needs_tagging", "pending_confirmation"}
    for field in allowed:
        if field in request.data:
            setattr(song, field, request.data[field])
    song.save()
    return Response(SongSerializer(song).data)

@api_auth_required
@api_view(["POST"])
def cleanup_history_view(request):
    days = request.data.get("days")
    try:
        count = cleanup_deleted_history(days_override=int(days)) if days is not None else cleanup_deleted_history()
        return Response({"status": "ok", "count": count})
    except Exception as e: return Response({"error": str(e)}, status=500)

@api_auth_required
@api_view(["GET"])
def search_musicbrainz_view(request):
    query = request.query_params.get("q", "")
    if not query: return Response([])
    results = search_musicbrainz_api(query)
    return Response(results)
