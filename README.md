# xyMusicUpdater

<div align="center">
  <img src="./frontend/public/icon.png" alt="xyMusicUpdater Logo" width="120" height="120" />
</div>


<div align="center">
  <img src="https://img.shields.io/docker/v/xyseer/xymusicupdater/latest" alt="Docker Image Version" />
  <img src="https://img.shields.io/docker/pulls/xyseer/xymusicupdater" alt="Docker Pulls" />
</div>

xyMusicUpdater is a highly customized, full-stack (Django/React) companion application designed to supercharge and manage your **Navidrome** music library. Built with a modern Django backend and a sleek React frontend, it intelligently handles downloading, metadata tagging, audio trimming, and compilation merging—all while seamlessly keeping your Navidrome database in sync.

## ✨ Key Features

*   **Automated & Manual Discovery**: Fetch high-quality audio directly from user-defined playlists or individual URLs using an embedded download engine.
*   **Robust Duplicate Detection**: Cross-references filenames, Video IDs, and normalized Unicode metadata across active and *deleted* statuses to prevent redundant downloads and save bandwidth.
*   **Intelligent Auto-Tagging**: Matches raw downloads against the **MusicBrainz** and **Apple Music** APIs to automatically fetch cover art, album names, and artist metadata.
*   **In-Browser Music Editor**: Trim audio files precisely using an FFmpeg-powered preview-before-commit workflow, directly within the web UI.
*   **Compilation Album Merger**: Automatically detects multi-artist albums and provides a one-click merge tool to unify them under "Various Artists," keeping your library clean.
*   **Acoustic Duplicate Scanner**: Fingerprints your entire Navidrome library using **Chromaprint** (`fpcalc`) and groups acoustically identical tracks — even when they differ in tags, filename, or have intro/outro offsets. Review duplicates in a paginated UI with per-song keep/delete controls; nothing is auto-deleted.
*   **Purge Analysis & Protection**: Analyzes storage usage and safely archives/deletes old tracks based on customizable retention policies, while protecting songs found in designated "Monitored Playlists."
*   **Modern Security**: Features AES-CBC encrypted password transmission, a dynamic per-boot `SECRET_KEY`, and a strict `@api_auth_required` API firewall.
*   **Glassmorphism UI**: A fully responsive, multi-language (EN/ZH/JA) React frontend featuring smooth CSS animations, infinite-scrolling marquees, and dynamic background theming.

## 🏗️ Architecture

xyMusicUpdater operates alongside Navidrome via Docker Compose:

1.  **Backend (Django 5.x / Python 3.12)**: Handles business logic, FFmpeg audio processing, SQLite database management, and exposes a RESTful API + Server-Sent Events (SSE) stream.
2.  **Frontend (React 18 / Vite)**: A Single Page Application offering a rich, desktop-like management dashboard.
3.  **Navidrome**: Acts as the underlying media server and Subsonic API provider.

*Note: xyMusicUpdater directly interacts with Navidrome's underlying `navidrome.db` (SQLite) via a shared Docker volume to achieve instant metadata syncing without waiting for periodic rescans.*

## 🚀 Installation & Setup

xyMusicUpdater is designed to be deployed via Docker Compose.

### 1. Prerequisites
*   Docker and Docker Compose installed on your host machine.

### 2. Deployment
A standard template `docker-compose.example.yml` integrates both Navidrome and xyMusicUpdater.
Copy this template as `docker-compose.yml` to your folder. Fill out the essential arguments like volume mount paths, username, and password.

If you prefer not to use the Docker deployment, you can refer to the `Dockerfile` to start the service natively using Python and Node.js.

### 3. Start the Server
```bash
# In your project folder
docker compose up -d
```
Access the UI at `http://localhost:4534`.

## 🔐 Authentication

*   **Default Credentials**: Controlled by `APP_USER` and `APP_PASSWORD` in your `docker-compose.yml`.
*   **Security Protocol**: The application uses a dynamic, non-persistent secret key generated on every boot. This means **sessions do not persist across container restarts** (you may need to refresh your browser after a service reboot).

## 📁 Directory Structure (Inside Container)
*   `/music/temp`: Staging area for new downloads and unprocessed files.
*   `/music/permanent`: Archive for protected/favorited tracks.
*   `/app/data`: Persistent volume for the SQLite database, custom backgrounds, and temporary audio previews (`/app/data/previews`).
*   `/navidrome_data`: Shared volume containing Navidrome's database for direct read/write access.

## 🛠️ Development

To build or modify the frontend assets:
```bash
cd frontend
npm install
npm run build
```

To run the backend locally, please use standard Django WSGI methods or development commands to start the backend. The Django application will automatically serve the built static files from `frontend/dist`.

---

## ⚠️ Legal & AI Disclaimer

**AI-Generated Content**: This project contains AI-generated code. If you have any concerns regarding AI-assisted development, please refrain from using this software.

**Educational Purpose**: This project is intended strictly for educational and learning purposes only. It is not intended for any commercial or business use.

The core functionality of this project is local file management and metadata tagging. The optional download module is disabled by default. It is provided solely as a technical proof-of-concept and should only be enabled and used by individuals who have explicit legal rights or permission to download the target content (e.g., royalty-free music, personal podcast backups).

The authors and contributors of this project do not endorse, encourage, or facilitate copyright infringement. The authors assume no responsibility or liability for any actions taken by users with this software. By using this software, you agree to bear full responsibility for your actions and comply with all applicable local and international laws, as well as the Terms of Service of any platforms you interact with.
