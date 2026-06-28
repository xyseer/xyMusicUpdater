from rest_framework import serializers
from pathlib import Path
from .models import Song, DownloadJob, ActivityLog, PermanentLog, SearchSubscription

class ActivityLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = ActivityLog
        fields = '__all__'

class SongSerializer(serializers.ModelSerializer):
    original_tags = serializers.SerializerMethodField()
    staged_cover_url = serializers.SerializerMethodField()

    class Meta:
        model = Song
        fields = '__all__'

    def get_original_tags(self, obj):
        if not obj.pending_confirmation:
            return None
        try:
            from .logic import _read_basic_tags
            path = Path(obj.filepath)
            if path.exists():
                t, a, al, aa = _read_basic_tags(path)
                return {"title": t, "artist": a, "album": al, "album_artist": aa}
        except Exception:
            pass
        return None

    def get_staged_cover_url(self, obj):
        if not obj.pending_confirmation:
            return ""
        try:
            from .logic.tagger import _read_pending_cover_url
            path = Path(obj.filepath)
            if path.exists():
                return _read_pending_cover_url(path)
        except Exception:
            pass
        return ""

class DownloadJobSerializer(serializers.ModelSerializer):
    logs = ActivityLogSerializer(many=True, read_only=True)
    songs_added = SongSerializer(many=True, read_only=True)

    class Meta:
        model = DownloadJob
        fields = '__all__'

class PermanentLogSerializer(serializers.ModelSerializer):
    song_details = SongSerializer(source='song', read_only=True)

    class Meta:
        model = PermanentLog
        fields = '__all__'

class SearchSubscriptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = SearchSubscription
        fields = '__all__'
