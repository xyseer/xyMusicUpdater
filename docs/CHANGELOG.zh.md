# 更新日志

---

## [1.3.0]

### 新功能
- **SoundCloud 来源**（由 [WorldVanquisher](https://github.com/WorldVanquisher) 贡献）— SoundCloud 作为一级下载和搜索来源与 YouTube 并列；手动下载和发现功能中可自动识别 SoundCloud 链接；搜索结果显示来源标识。
- **yt-dlp 自动更新** — 基于调度器的二进制自动更新，每 30 天从 GitHub 下载最新 `yt-dlp` 版本，防止过期失效。
- **不清除归档选项** — 新增每首歌的 `no_purge` 标志。标记为"不清除"的歌曲在清除时会被移动到永久归档文件夹而非删除。
- **库中的通配符搜索** — 曲库标签搜索框支持对 `title`、`artist` 和 `filename` 字段进行服务端自由文本过滤匹配。
- **库中的裁剪按钮** — 曲库每行现在有一个直接"裁剪"按钮，点击后切换至音乐编辑标签并预选该歌曲。
- **重复组中的文件路径** — 重复面板中每张歌曲卡片现在显示完整的文件系统路径，便于在删除前区分不同目录中的副本。

### 修复
- **删除路径保护**（`duplicates.py`、`song_views.py`）— 重复面板和曲库中的删除操作现在会在与 `PERMANENT_SAVING_DIR` 比对前解析完整路径，防止意外删除已归档文件。
- **useSSE 重试断言**（前端测试）— 修正 `useSSE.test.js` 中重试延迟和重试次数的断言，使其与实际 5 秒 / 10 次重试的行为一致。
- **Deno 运行时修复** — 镜像中已安装 `deno` 作为 yt-dlp 的 JavaScript 运行时。

---

## [1.2.1]

### 修复
- **合辑候选** — 合并至任意自定义专辑艺术家（不仅限于 "Various Artists"）的专辑现在会被正确排除出建议列表；修复了始终为 `false` 的逻辑不可能 SQL 条件。
- **合辑界面** — 每个专辑组新增全选 / 取消全选切换；新增永久"永久忽略"按钮（`/app/data/compilation_ignored.json`），与仅限本次会话的"丢弃"功能区分。
- **标签封面拖放** — 原始封面现在始终可拖动；拖放区通过 `text/uri-list` 接受页面图片拖入；跨歌曲封面拖动在拖动时捕获 canvas 数据 URL，确保可靠的同步传递。

---

## [1.2.0]

### 新功能
- **重复检测标签页** — 用户触发的后台任务通过 `fpcalc`（Chromaprint）对整个 Navidrome 曲库进行指纹识别。滑动窗口比较（±40 偏移量 ≈ ±5 秒）即使在前奏/尾奏长度不同时也能检测到重复。时长窗口：±30 秒。结果存储在 `/app/data/duplicates.json`（无需迁移）。审核界面：每首歌保留/删除切换、忽略组、分页，从不自动删除。
- **移动端友好界面** — `useIsMobile` 钩子（响应式缩放）；可折叠左侧边栏（Logo 切换，宽度 0 ↔ 200 px）；SongTable 在移动端切换为卡片布局；2 列网格 → 单列；TaggingPanel 编辑区竖向堆叠；曲库新增跳转 Navidrome 按钮；运行流水线图标改为播放图标。
- **每订阅关键词黑名单** — `SearchSubscription` 模型新增 `keyword_blacklist` 字段（迁移 0002）。发现任务跳过与任意逗号分隔模式匹配的标题。UI 输入位于 DiscoveryPanel；已从全局设置中移除。
- **直接文件上传** — `POST /api/upload/` 接受多文件音频（mp3/flac/m4a/opus/ogg/wav）。保存至 `TEMP_FOLDER`，在后台线程运行 `register_songs` + 增量 Navidrome 重扫描。前端：ManualDownload 标签页中的拖放区 + 文件选择器。
- **智能发现排序** — 候选池扩展至目标配额的 3 倍再过滤；候选按 `upload_date` 从新到旧排序；排序后截取至 `max_items`。关键词订阅使用 `ytsearch{3×amount}:kw` 填充更大的候选池。发现功能使用 `on_file_ready` 回调实现即时的每首歌注册。
- **合辑合并自定义专辑艺术家** — 合并界面现在为每张专辑提供文本输入框（默认 "Various Artists"），而非硬编码值。
- **曲库删除和重新标签按钮** — 曲库标签页每行现有内联删除（删除文件 + 数据库记录）和重新标签（标记 `needs_tagging=true`）按钮。

### 修复
- `fix(m3u)` — `latest.m3u` 现在直接查询 Navidrome 的 `media_file` 表而非 Django Song 表，无论下载来源如何，所有曲库曲目均会显示。
- `fix(tagging)` — 标签面板在确认/保存/删除后保留滚动位置，不再整页刷新。
- `fix(compilation)` — 合辑合并时对路径进行 URL 解码 + 多策略路径解析（`NAVIDROME_MUSIC_ROOT` 环境变量），支持跨容器文件访问。
- `fix(tagging-panel)` — 恢复 `album_artist` 字段；从"使用原始"中移除确认对话框；修复 `useCallback` TDZ 崩溃；修复 `notify` 属性未从 App 传入的问题。

### 改进
- 任务历史分页（`GET /api/jobs/` 新增 `page` + `page_size` 查询参数）。
- `DUPLICATE_THRESHOLD` 可在设置中配置（默认 0.80，范围 0.5–1.0）。
- `DEFAULT_PAGE_SIZE` 现在同样控制 JobsPanel 和 DuplicatesPanel 的分页。
- 发现任务通过 `on_file_ready` 立即注册歌曲（每首歌下载时即显示在曲库，而非整批下载完成后）。

---

## [1.1.5]

### 新功能
- **AcoustID 音频指纹** — `fpcalc` + AcoustID API 集成，用于后端自动标签。AcoustID 完美匹配的歌曲无需人工审核即可自动确认。
- **服务端分页** — 所有大型列表（曲库、标签、合辑、清除分析、音乐编辑器）均使用服务端分页，支持可配置的 `DEFAULT_PAGE_SIZE`。
- **前端直接标签搜索** — 标签标签页直接从浏览器调用 iTunes 和 MusicBrainz API，减少后端负载。后端 `search_musicbrainz_api` 保留用于下载后自动标签。
- **Navidrome 增量重扫描** — 每个发现/下载任务触发轻量级增量重扫描，而非完整曲库重扫描，大幅缩短大型曲库的等待时间。
- **音乐编辑器重构** — 裁剪编辑器重建，配备波形可视化、拖拽手柄界面、预览确认流程以及歌曲列表分页。
- **CI/CD 流水线** — GitHub Actions 工作流，支持后端 pytest、前端 vitest，以及在版本标签上进行多架构 Docker 推送（`linux/amd64` + `linux/arm64`）。

### 修复
- 修复影响部分环境 API 请求的跨域（CORS）问题。
- 修复动态密钥生成与 WSGI 服务器工作进程启动之间的 `SECRET_KEY` 冲突。
- 修复重构过程中引入的首页刷新和视觉回归问题。

---

## [1.1.2]

### 新功能
- **可配置 API 超时** — `API_TIMEOUT_SECONDS` 设置；Axios 实例动态更新。合辑合并性能优化。
- **合辑合并工具** — 检测多艺术家专辑并通过 `TCMP` ID3 标签将其合并至 "Various Artists"；封面艺术保留。
- **后端模块化重构** — 逻辑拆分为 `ytdlp.py`、`tagger.py`、`pipeline.py`、`storage.py`、`navidrome.py`、`editor.py`、`discovery.py`、`utils.py`。
- **响应式界面基础** — 玻璃态设计（`blur(12px)`）、用户自定义 RGB HEX 主题色（`--accent`）、无限滚动文字。

---

## [1.1.1]

### 新功能
- 新增：将界面适配现代玻璃态效果，提供更多自定义选项和动画。
- 新增：实现合辑合并工具，用于将多艺术家专辑分组。
- 新增：实现带预览确认的音乐编辑器，现可直接在此裁剪歌曲，无需其他工具。
- 新增：引入现代认证流程，所有传输内容均受保护。
- 优化：调整大部分调度器以适配更常见的使用场景。

---

## [1.0.1]

### 新功能
- **搜索媒体** — `GET /api/search-media/` 用于 yt-dlp 关键词搜索；结果显示在手动下载标签页。
- **重复覆盖** — 手动下载复选框，用于绕过重复检测。
- **国际化** — 通过 `i18next` 提供英文 / 中文 / 日文翻译。
- **调度器界面** — APScheduler 状态面板，支持每个任务手动触发和自定义间隔配置。

---

## [1.0.0] — 初始发布

- Django 5 + DRF 后端；React 18 + Vite 前端；Gunicorn（`--workers 2 --threads 8 --timeout 0`）。
- yt-dlp 集成：通过 URL 或关键词下载，支持播放列表、MP3 提取、ffprobe 完整性检查。
- MusicBrainz + iTunes 自动标签，带待确认流程。
- Navidrome 集成：Subsonic API 重扫描、直接 SQLite 读写、`latest.m3u` 生成。
- 存储配额管理：超出阈值时清除最旧歌曲、播放列表保护、归档至永久目录。
- AES-CBC 加密登录；每次容器启动生成非持久化 `SECRET_KEY`。
- SSE 实时日志流；APScheduler 每订阅发现任务。
