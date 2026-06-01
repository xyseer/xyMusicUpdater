# Changelog

---

## [1.2.1] — 2026-06-01

### Fixes
- **Compilation candidates** — Albums merged to any custom album artist (not just "Various Artists") are now correctly excluded from suggestions; fixed logically-impossible SQL condition that was always `false`.
- **Compilation UI** — Added Select All / Deselect All toggle per album group; added permanent "Ignore Forever" button (`/app/data/compilation_ignored.json`) distinct from session-only Discard.
- **Tagging cover drag-and-drop** — Original cover is now always draggable; drop zone accepts page-image drags via `text/uri-list`; cross-song cover drag captures a canvas data URL at drag time for reliable synchronous delivery.

---

## [1.2.0]

### Features
- **Duplicate Detection Tab** — User-triggered background job fingerprints the entire Navidrome library via `fpcalc` (Chromaprint). Sliding-window comparison (±40 offsets ≈ ±5 s) detects duplicates even when intro/outro lengths differ. Duration window: ±30 s. Results stored in `/app/data/duplicates.json` (no migration needed). Review UI: per-song keep/delete toggle, dismiss group, paginated, never auto-deletes.
- **Mobile-Friendly UI** — `useIsMobile` hook (resize-aware); collapsible left sidebar (logo toggle, width 0 ↔ 200 px); SongTable switches to card layout on mobile; 2-column grids → single column; TaggingPanel edit section stacks vertically; Go-to-Navidrome button in Library; Run Pipeline icon changed to Play.
- **Per-Subscription Keyword Blacklist** — `SearchSubscription` model gains `keyword_blacklist` field (migration 0002). Discovery jobs skip titles matching any comma-separated pattern. UI input in DiscoveryPanel; removed from global settings.
- **Direct File Upload** — `POST /api/upload/` accepts multi-file audio (mp3/flac/m4a/opus/ogg/wav). Saves to `TEMP_FOLDER`, runs `register_songs` + incremental Navidrome rescan in background thread. Frontend: drag-drop zone + file picker in ManualDownload tab.
- **Smart Discovery Sorting** — Candidate pool expanded to 3× target quota before filtering; candidates sorted by `upload_date` newest-first; sliced to `max_items` after sort. Keyword subscriptions use `ytsearch{3×amount}:kw` to populate the larger pool. Discovery uses `on_file_ready` callback for immediate per-song registration.
- **Custom Album Artist for Compilation Merge** — Merge UI now has a per-album text input (default "Various Artists") instead of hardcoded value.
- **Library Delete & Re-tag Buttons** — Each row in the Library tab now has inline Delete (removes file + DB record) and Re-tag (marks `needs_tagging=true`) buttons.

### Fixes
- `fix(m3u)` — `latest.m3u` now queries Navidrome's `media_file` table directly instead of the Django Song table, so all library tracks appear regardless of download source.
- `fix(tagging)` — Tagging panel retains scroll position after confirm/save/delete; no full page refresh.
- `fix(compilation)` — URL-decode + multi-strategy path resolution (`NAVIDROME_MUSIC_ROOT` env) for cross-container file access during compilation merge.
- `fix(tagging-panel)` — Restored `album_artist` field; removed confirm dialog from "Use Original"; fixed `useCallback` TDZ crash; fixed `notify` prop not passed from App.

### Improvements
- Job History pagination (`page` + `page_size` query params on `GET /api/jobs/`).
- `DUPLICATE_THRESHOLD` configurable in Settings (default 0.80, range 0.5–1.0).
- `DEFAULT_PAGE_SIZE` now governs JobsPanel and DuplicatesPanel pagination as well.
- Discovery jobs register songs immediately via `on_file_ready` (visible in Library as each song downloads, not only after the whole batch finishes).

---

## [1.1.5]

### Features
- **AcoustID Audio Fingerprinting** — `fpcalc` + AcoustID API integration for backend auto-tagging. Songs with a perfect AcoustID match are auto-confirmed without manual review.
- **Server-Side Pagination** — All large lists (Library, Tagging, Compilation, Purge Analysis, Music Editor) use server-side pagination with configurable `DEFAULT_PAGE_SIZE`.
- **Frontend-Direct Tag Search** — Tagging tab calls iTunes and MusicBrainz APIs directly from the browser, reducing backend load. Backend `search_musicbrainz_api` is retained for auto-tag after download.
- **Navidrome Incremental Rescan** — Each discovery/download job triggers a lightweight incremental rescan instead of a full library rescan, dramatically reducing wait time for large libraries.
- **Music Editor Rework** — Trim editor rebuilt with waveform visualizer, handle-drag UI, preview-then-confirm flow, and pagination for the song list.
- **CI/CD Pipeline** — GitHub Actions workflow for backend pytest, frontend vitest, and multi-arch Docker push (`linux/amd64` + `linux/arm64`) on version tags.

### Fixes
- Fixed cross-origin (CORS) issues affecting API requests from some setups.
- Fixed `SECRET_KEY` conflict between dynamic key generation and WSGI server worker startup.
- Fixed homepage refresh and visual regressions introduced during refactor.

---

## [1.1.2]

### Features
- **Configurable API Timeout** — `API_TIMEOUT_SECONDS` setting; Axios instance updated dynamically. Compilation merge performance optimized.
- **Compilation Merge Tool** — Detect multi-artist albums and merge them under "Various Artists" with `TCMP` ID3 tag; cover art preserved.
- **Modular Backend Refactor** — Logic split into `ytdlp.py`, `tagger.py`, `pipeline.py`, `storage.py`, `navidrome.py`, `editor.py`, `discovery.py`, `utils.py`.
- **Responsive UI Foundation** — Glassmorphism design (`blur(12px)`), user-defined RGB HEX theme color (`--accent`), infinite scrolling text.

---

## [1.1.1]

### Features
- feat: Adapt UI to modern glassmorphism effect, with more customization and animations.
- feat: implement compilation merge tool to group multi-artist albums.
- feat: implement music editor with preview confirmation, now you can directly trim your songs here without other tools.
- feat: bring a modern authentication procedures, now everything is protected for transmission.
- enhanced: change most of scheduler to fit more common scenario.

---

## [1.0.1]

### Features
- **Search Media** — `GET /api/search-media/` for yt-dlp keyword search; results shown in Manual Download tab.
- **Duplicate Override** — Manual download checkbox to bypass duplicate detection.
- **i18n** — EN / ZH / JA translations via `i18next`.
- **Scheduler UI** — APScheduler status panel with per-task manual trigger and custom interval configuration.

---

## [1.0.0] — Initial Release

- Django 5 + DRF backend; React 18 + Vite frontend; Gunicorn (`--workers 2 --threads 8 --timeout 0`).
- yt-dlp integration: download by URL or keyword, playlist support, MP3 extraction, integrity check via ffprobe.
- MusicBrainz + iTunes auto-tagging with pending-confirmation flow.
- Navidrome integration: Subsonic API rescan, direct SQLite read/write, `latest.m3u` generation.
- Storage quota management: purge oldest songs on threshold, playlist protection, archive-to-permanent.
- AES-CBC encrypted login; non-persistent `SECRET_KEY` per container boot.
- SSE live log stream; APScheduler per-subscription discovery jobs.
