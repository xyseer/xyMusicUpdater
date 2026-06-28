from datetime import timedelta
from pathlib import Path
from typing import Any, Optional
from django.utils import timezone as dj_tz
from .utils import _cfg, emit
from .ytdlp import _ytdlp_download, _search_prefix
from .navidrome import navidrome_rescan
from .storage import purge_oldest_songs
from .pipeline import register_songs

def run_single_subscription(sub_id: int) -> int:
    from ..models import SearchSubscription, DownloadJob
    try:
        sub = SearchSubscription.objects.get(pk=sub_id)
        if not sub.active:
            return 0
    except SearchSubscription.DoesNotExist:
        return 0

    cfg = _cfg()
    temp = Path(cfg["TEMP_FOLDER"])
    # Discovery uses the global default download source (Settings → Default Download Source).
    provider = cfg.get("DOWNLOAD_PROVIDER", "youtube")
    search_prefix = _search_prefix(provider)
    job = DownloadJob.objects.create(job_type="manual", status="running", created_at=dj_tz.now(), url=f"Discovery: {sub.label}")
    emit(f"Discovery Started: {sub.label} (source: {provider})", job=job)
    keywords = [k.strip() for k in sub.keywords.split(",") if k.strip()]
    newly_added = 0
    for kw in keywords:
        # For keyword searches, request 3× more candidates than the target quota so the
        # blacklist/duplicate filter and smart date sort have a meaningful pool to work with.
        fetch_count = min(sub.amount * 3, 150) if not kw.startswith("http") else sub.amount
        search_query = kw if kw.startswith("http") else f"{search_prefix}{fetch_count}:{kw}"

        # Register each song immediately upon download (same as manual download) so songs
        # appear in the library one by one rather than only after the whole batch finishes.
        kw_added = 0
        def _on_file_ready(f: Path, _src=f"discovery:{sub.label}", _job=job) -> None:
            nonlocal kw_added
            kw_added += len(register_songs([f], source=_src, job=_job))

        _ytdlp_download(search_query, temp, f"discovery_{getattr(sub, 'id')}", max_items=sub.amount, job=job, allow_playlist=True, keyword_blacklist=sub.keyword_blacklist or "", on_file_ready=_on_file_ready)
        newly_added += kw_added
    
    sub.last_run = dj_tz.now()
    sub.save()
    
    job.status = "done"
    job.finished_at = dj_tz.now()
    job.save()
    
    emit(f"Discovery Finished: {sub.label}", job=job)
    return newly_added

def run_search_subscriptions(force: bool = False) -> None:
    from ..models import SearchSubscription
    subs = SearchSubscription.objects.filter(active=True)
    any_added = False
    for sub in subs:
        if force or not sub.last_run or dj_tz.now() >= sub.last_run + timedelta(days=sub.cycle_days):
            added = run_single_subscription(getattr(sub, 'id'))
            if added and added > 0:
                any_added = True
                
    if any_added: 
        navidrome_rescan()
        purge_oldest_songs()
