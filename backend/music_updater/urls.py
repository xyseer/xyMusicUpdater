from django.contrib import admin
from django.urls import path, re_path
from django.views.generic import TemplateView
from django.conf import settings
from django.conf.urls.static import static
from core import api as views

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/status/', views.status_view),
    path('api/songs/', views.songs_view),
    path('api/songs/playlist-map/', views.playlist_map_view),
    path('api/songs/auto-tag-all/', views.auto_tag_all_view),
    path('api/songs/confirm-tags/', views.confirm_tags_view),
    path('api/songs/reject-tags/', views.reject_tags_view),
    path('api/songs/cleanup-history/', views.cleanup_history_view),
    path('api/songs/<int:pk>/', views.song_detail_view),
    path('api/songs/<int:pk>/cover/', views.song_cover_view),
    path('api/songs/<int:pk>/revert/', views.revert_song_view),
    path('api/songs/<int:pk>/stage/', views.stage_tags_view),
    path('api/jobs/', views.jobs_list),
    path('api/jobs/<int:pk>/', views.job_detail),
    path('api/jobs/manual/', views.manual_download),
    path('api/search-media/', views.search_media_view),
    path('api/jobs/cron/', views.trigger_cron),
    path('api/scheduler/', views.scheduler_info_view),
    path('api/scheduler/trigger/', views.trigger_task_view),
    path('api/rescan/', views.rescan_view),
    path('api/purge/', views.purge_view),
    path('api/purge/upcoming/', views.upcoming_purges_view),
    path('api/config/', views.get_config_view),
    path('api/config/update/', views.update_config_view),
    path('api/config/background/', views.get_background_view),
    path('api/config/background/upload/', views.upload_background_view),
    path('api/musicbrainz/search/', views.search_musicbrainz_view),
    path('api/playlists/', views.playlists_view),
    path('api/subscriptions/', views.subscriptions_view),
    path('api/subscriptions/<int:pk>/', views.subscriptions_view),
    path('api/subscriptions/run/', views.run_subscriptions_view),
    path('api/permanent-log/', views.permanent_log_view),
    path('api/compilation/candidates/', views.compilation_candidates_view),
    path('api/compilation/merge/', views.merge_compilation_view),
    path('api/compilation/ignore/', views.ignore_compilation_view),
    path('api/nd-cover/<str:nd_id>/', views.nd_song_cover_view),
    path('api/songs/<int:pk>/stream/', views.stream_song_view),
    path('api/songs/<int:pk>/trim/', views.trim_song_view),
    path('api/songs/<int:pk>/trim/confirm/', views.confirm_trim_view),
    path('api/editor/cleanup-previews/', views.cleanup_previews_view),
    path('api/upload/', views.upload_songs_view),
    path('api/duplicates/', views.duplicates_list_view),
    path('api/duplicates/scan/', views.duplicates_scan_view),
    path('api/duplicates/status/', views.duplicates_status_view),
    path('api/duplicates/dismiss/', views.duplicates_dismiss_view),
    path('api/duplicates/delete/', views.duplicates_delete_view),
    path('api/auth/login/', views.login_view),
    path('api/auth/logout/', views.logout_view),
    path('api/auth/session/', views.session_view),
    path('api/events/', views.sse_stream),
]

if settings.DEBUG:
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)

# Catch-all for React SPA (exclude /static and /api)
urlpatterns += [
    re_path(r'^(?!static|api|admin).*$', TemplateView.as_view(template_name='index.html')),
]
