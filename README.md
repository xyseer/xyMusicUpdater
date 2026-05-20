# Navidrome Music Manager

A comprehensive, containerized system for intelligently fetching, tagging, and managing your music library for Navidrome. It combines a powerful Django/yt-dlp backend with a modern React frontend dashboard.

## Features

- **Automated Discovery & Fetching**: Subscribe to YouTube/SoundCloud playlists or search keywords. The system periodically checks for and downloads new tracks automatically.
- **Smart Duplicate Detection**: Before downloading, the engine cross-references both your local library and Navidrome's database using exact string matches and inclusion heuristics to prevent duplicate downloads and save bandwidth.
- **Intelligent Auto-Tagging**: Metadata is automatically sourced via MusicBrainz and iTunes APIs. Matches are held in a "Draft" state for your manual review, ensuring perfect library organization.
- **Robust Storage Management (Purge Analysis)**: Define a quota and a holding period. Old tracks are automatically purged from the temporary pool unless they belong to monitored playlists. Protected tracks are moved to permanent storage.
- **Advanced yt-dlp Integration**: Full support for authenticated downloads (Netscape cookies, headers, Username/Password, and Proxy settings) directly configurable via the UI.
- **Interactive React Dashboard**: A polished web interface providing real-time Server-Sent Events (SSE) logs, bulk tagging confirmation, manual metadata editing (with drag-and-drop cover support), and configuration management.

## Project Structure

```
├── docker-compose.yml       # Production/development orchestration
├── Dockerfile               # Multi-stage build (React -> Django)
├── backend/                 # Django application & music engine
│   ├── manage.py
│   ├── requirements.txt
│   ├── core/                # Core logic, SSE views, API endpoints, Celery/Thread tasks
│   └── music_updater/       # Django settings and routing
└── frontend/                # React Vite application
    ├── package.json
    ├── vite.config.js
    └── src/
        ├── api.js           # Axios HTTP client
        ├── App.jsx          # Main layout and routing
        └── components/      # UI panels (Discovery, Tagging, Settings, etc.)
```

## Setup & Installation

### Requirements
- Docker and Docker Compose

### Running the Stack

1. Clone this repository.
2. Build and start the containers:
   ```bash
   docker compose up -d --build
   ```
3. Access the dashboard:
   Open `http://localhost:8000` in your web browser.

### Volumes & Persistence
- `navidrome_data`: The database of your Navidrome instance. The manager mounts this to synchronize tags and perform direct SQL duplicate checks.
- `manager_data`: The SQLite database for the manager's queues, song registries, and configurations.
- `music_temp`: The staging ground for newly downloaded tracks.
- `music_permanent`: Long-term storage for protected playlist tracks.

## Configuration

All critical settings are configurable via the **Settings** tab in the web dashboard.
- **Navidrome Credentials**: Required for the manager to trigger rescans and delete missing files via the API.
- **yt-dlp Authentication**: Essential for downloading private playlists or geo-restricted content. Paste your browser cookies or use credentials.
- **Purge Policies**: Set `MAX_DELETE_PER_PURGE` and `HOLD_PERIOD_DAYS` to manage your disk space.

## Workflow Overview

1. **Download**: Add a manual URL or let a Discovery Task trigger.
2. **Analysis**: The engine checks the Navidrome DB for duplicates using combined title/artist heuristics.
3. **Fetch & Tag**: `yt-dlp` fetches the audio. The engine queries MusicBrainz/iTunes.
4. **Supervise**: Open the **Manual Tagging** tab to review the drafted metadata side-by-side with original file tags. Confirm, Reject, or Use Original.
5. **Sync**: Confirmed tags are written to the `.mp3` file via Mutagen, and the Navidrome database is forcibly synced.

## License
MIT License.
