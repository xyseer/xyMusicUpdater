# xyMusicUpdater

<div align="center">
  <img src="./frontend/public/icon.png" alt="xyMusicUpdater Logo" width="120" height="120" />
</div>

<div align="center">
  <img src="https://img.shields.io/docker/v/xyseer/xymusicupdater/latest" alt="Docker Image Version" />
  <img src="https://img.shields.io/docker/pulls/xyseer/xymusicupdater" alt="Docker Pulls" />
</div>

xyMusicUpdater 是一个高度定制的、全栈式 (Django/React) 伴侣应用程序，旨在强化和管理您的 **Navidrome** 音乐库。它基于现代化的 Django 后端和流畅的 React 前端构建，可以智能地处理音乐下载、元数据标签提取、音频剪辑和合辑合并——所有这些都能与您的 Navidrome 数据库无缝同步。

## ✨ 核心特性

*   **自动与手动发现**: 使用内置的下载引擎，直接从用户自定义的播放列表或单个 URL 抓取高品质音频。
*   **强大的去重检测**: 跨“活跃”和“已删除”状态交叉比对文件名、Video ID 以及 Unicode 规范化元数据，防止重复下载并节省带宽。
*   **智能自动打标**: 将原始下载与 **MusicBrainz** 和 **Apple Music** API 进行匹配，自动抓取封面、专辑名称和艺术家元数据。
*   **浏览器内嵌音频剪辑**: 直接在 Web UI 中使用基于 FFmpeg 的剪辑工具，支持“先预览后确认”的工作流，实现精准的音频裁剪。
*   **合辑合并工具**: 自动检测多艺术家专辑，并提供一键式合并工具将它们统一到”Various Artists”下，保持曲库整洁。
*   **声学重复扫描**: 使用 **Chromaprint**（`fpcalc`）对整个 Navidrome 曲库进行音频指纹识别，即使标签、文件名不同或存在前奏/尾奏偏移，也能将声学上相同的曲目分组。在分页 UI 中逐曲审查并选择保留/删除，绝不自动删除。
*   **清理分析与保护**: 分析存储使用情况，基于自定义的保留策略安全地归档/删除旧曲目，同时保护“受监控播放列表”中的歌曲。
*   **现代安全性**: 采用 AES-CBC 密码加密传输、每次启动动态生成 `SECRET_KEY`，以及严格的 `@api_auth_required` API 防火墙。
*   **毛玻璃拟态 UI**: 完全响应式、支持多语言 (EN/ZH/JA) 的 React 前端，拥有流畅的 CSS 动画、无限走马灯和动态背景主题。

## 🏗️ 架构

xyMusicUpdater 通过 Docker Compose 与 Navidrome 协同工作：

1.  **后端 (Django 5.x / Python 3.12)**: 处理业务逻辑、FFmpeg 音频处理、SQLite 数据库管理，并暴露 RESTful API + 服务器发送事件 (SSE) 流。
2.  **前端 (React 18 / Vite)**: 提供丰富且类桌面级管理面板的单页面应用 (SPA)。
3.  **Navidrome**: 充当底层媒体服务器和 Subsonic API 提供者。

*注：xyMusicUpdater 通过共享的 Docker 数据卷直接与 Navidrome 底层的 `navidrome.db` (SQLite) 进行交互，从而实现即时的元数据同步，无需等待周期性扫描。*

## 🚀 安装与设置

xyMusicUpdater 推荐使用 Docker Compose 部署。

### 1. 前置条件
*   宿主机已安装 Docker 和 Docker Compose。

### 2. 部署
项目中提供了一个标准的模板 `docker-compose.example.yml`，它集成了 Navidrome 和 xyMusicUpdater。
请将该模板复制为 `docker-compose.yml`，并填写必要的参数，如数据卷挂载路径、用户名和密码等。

如果您不想使用 Docker 部署，可以参考 `Dockerfile`，在本地使用原生的 Python 和 Node.js 启动服务。

### 3. 启动服务
```bash
# 在您的项目目录下执行
docker compose up -d
```
访问 UI 界面：`http://localhost:4534`。

## 🔐 身份验证

*   **默认凭证**: 由 `docker-compose.yml` 中的 `APP_USER` 和 `APP_PASSWORD` 控制。
*   **安全协议**: 应用程序在每次启动时动态生成一个非持久化的安全密钥。这意味着**会话不会在容器重启后保留**（服务重启后，您可能需要刷新浏览器以重新获取密钥）。

## 📁 目录结构 (容器内部)
*   `/music/temp`: 新下载和未处理文件的暂存区。
*   `/music/permanent`: 存档区，存放受保护/收藏的曲目。
*   `/app/data`: 持久化数据卷，用于存放 SQLite 数据库、自定义背景图以及临时的音频预览 (`/app/data/previews`)。
*   `/navidrome_data`: 共享数据卷，包含 Navidrome 的数据库，以供直接读写。

## 🛠️ 开发

构建或修改前端资源：
```bash
cd frontend
npm install
npm run build
```

如果要在本地运行后端，请使用标准的 Django WSGI 方式或开发命令启动服务。Django 后端会自动从 `frontend/dist` 提供编译后的静态文件服务。

---

## ⚠️ 法律与 AI 免责声明

**AI 生成代码**：本项目包含由 AI 辅助生成的代码。如果您对 AI 相关代码有任何顾虑，请停止使用本项目。

**本项目仅供学习和研究交流使用，严禁用于任何商业或营利性业务用途。**

本项目的核心功能是本地文件管理与元数据打标。系统内置的隐藏下载模块默认处于**完全关闭**状态。该模块仅作为一种技术概念验证（Proof-of-Concept）提供，只有在用户拥有合法权限的前提下（例如：下载免版权音乐、备份个人播客等）才可作为技术测试手动开启。

本项目的作者及贡献者不支持、不鼓励也不协助任何形式的版权侵权行为。作者不对用户使用本软件的任何行为承担任何责任或连带责任。使用本软件即表示您同意对自己的所有行为承担全部责任，并承诺严格遵守您所在国家和地区的法律法规，以及您所交互的任何平台的最终用户服务条款 (ToS)。
