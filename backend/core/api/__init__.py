from .system_views import status_view, sse_stream
from .song_views import (
    songs_view, song_detail_view, song_cover_view, revert_song_view,
    auto_tag_all_view, confirm_tags_view, reject_tags_view,
    cleanup_history_view, playlist_map_view, search_musicbrainz_view,
    compilation_candidates_view, merge_compilation_view, ignore_compilation_view, nd_song_cover_view,
    stage_tags_view
)
from .job_views import jobs_list, job_detail, manual_download, search_media_view, upload_songs_view
from .scheduler_views import scheduler_info_view, trigger_task_view, trigger_cron
from .config_views import get_config_view, update_config_view, upload_background_view, get_background_view
from .discovery_views import subscriptions_view, run_subscriptions_view
from .navidrome_views import (
    rescan_view, purge_view, upcoming_purges_view,
    playlists_view, permanent_log_view
)
from .editor_views import stream_song_view, trim_song_view, confirm_trim_view, cleanup_previews_view
from .auth_views import login_view, logout_view, session_view
from .duplicate_views import duplicates_status_view, duplicates_scan_view, duplicates_list_view, duplicates_dismiss_view, duplicates_delete_view
