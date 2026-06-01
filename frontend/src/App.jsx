import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from './api';
import { useSSE } from './hooks/useSSE';
import {
  Settings, Music, Tag, History, Activity,
  Database, RefreshCw, Download, Clock, Scissors, X, Play, ExternalLink
} from 'lucide-react';

import { StorageBar } from './components/StorageBar';
import { LiveLog } from './components/LiveLog';
import { ManualDownload } from './components/ManualDownload';
import { SongTable } from './components/SongTable';
import { JobsPanel } from './components/JobsPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { TaggingPanel } from './components/TaggingPanel';
import { PlaylistSelector } from './components/PlaylistSelector';
import { PurgePreview } from './components/PurgePreview';
import { DiscoveryPanel } from './components/DiscoveryPanel';
import { SchedulerPanel } from './components/SchedulerPanel';
import { CompilationMergePanel } from './components/CompilationMergePanel';
import { MusicEditor } from './components/MusicEditor';
import { LoginPanel } from './components/LoginPanel';
import { Toast } from './components/Toast';

const VERSION_NUMBER = "1.1.5";

const layout = {
  container: { height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)', color: 'var(--text)' },
  header: { padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface)', zIndex: 10 },
  main: { flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' },
  sidebar: { width: 240, borderRight: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', flexDirection: 'column', padding: '16px 0', zIndex: 5 },
  content: { flex: 1, overflowY: 'auto', padding: 24, background: 'var(--bg)', position: 'relative' },
  footer: { borderTop: '1px solid var(--border)', background: 'var(--surface)', zIndex: 10 },
  logo: { width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  navBtn: { padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', color: 'var(--text-dim)', borderLeft: '3px solid transparent', transition: 'all 0.2s', fontSize: 14, fontWeight: 500, position: 'relative' },
  navBtnActive: { color: '#fff', background: 'rgba(255,255,255,0.05)', borderLeftColor: 'var(--accent)' },
  sectionLabel: { fontSize: 11, fontWeight: 800, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: 16, letterSpacing: 1 },
  grid2: { display: 'flex', gap: 24 },
  actionBtn: { padding: '8px 16px', borderRadius: 6, border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 },
};

const NavBtn = ({ icon, label, id, active, count, setter }) => (
  <div
    className={`nav-btn ${active === id ? 'nav-btn-active' : ''}`}
    style={layout.navBtn}
    onClick={() => setter(id)}
  >
    {icon}
    <span style={{ flex: 1 }}>{label}</span>
    {count > 0 && (
      <div className="animate-bounce" style={{ background: 'var(--red)', color: '#fff', fontSize: 10, fontWeight: 900, padding: '2px 6px', borderRadius: 10, position: 'absolute', right: 12 }}>
        {count}
      </div>
    )}
  </div>
);

const App = () => {
  const { t, i18n } = useTranslation();
  const [session, setSession] = useState({ checked: false, user: null });
  const [activeTab, setActiveTab] = useState('library');
  const [status, setStatus] = useState(null);
  const [playlistMap, setPlaylistMap] = useState({});
  const [pendingCount, setPendingCount] = useState(0);
  const [isRescanning, setIsRescanning] = useState(false);
  const [notification, setNotification] = useState(null);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth > 768);
  const [isEventsOpen, setIsEventsOpen] = useState(window.innerWidth > 768);
  const [bgUrl, setBgUrl] = useState(null);

  const abortControllerRef = useRef(null);

  const showNotification = useCallback((message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  }, []);

  const handleLogout = useCallback(async () => {
    try { await api.logout(); } catch(e) {}
    setSession({ checked: true, user: null });
    setActiveTab('library');
  }, []);

  const onPermanentFailure = useCallback(() => {
    handleLogout();
    showNotification("System is offline. Reloading...", "error");
    setTimeout(() => window.location.reload(), 2000);
  }, [handleLogout, showNotification]);

  const sseRetryMs = (status?.config?.API_TIMEOUT_SECONDS || 15) * 1000;
  const { entries, isLive } = useSSE(session.user, onPermanentFailure, sseRetryMs);

  const isMobile = windowWidth <= 768;

  useEffect(() => {
    const handler = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  useEffect(() => {
    api.getSession()
      .then(res => setSession({ checked: true, user: res.authenticated ? res.user : null }))
      .catch(() => setSession({ checked: true, user: null }));

    const handleUnauthorized = () => {
      if (session.user) {
        handleLogout();
        showNotification("Session expired. Please login again.", "error");
      }
    };
    window.addEventListener('api-unauthorized', handleUnauthorized);
    return () => window.removeEventListener('api-unauthorized', handleUnauthorized);
  }, [session.user, handleLogout, showNotification]);

  useEffect(() => {
    if (session.user) {
        const img = new Image();
        img.src = '/api/config/background/';
        img.onload = () => setBgUrl('/api/config/background/');
    }
  }, [session.user]);

  const fetchStatus = useCallback(async (signal) => {
    if (!session.user) return;
    try {
      const statusRes = await api.getStatus(signal);
      setStatus(statusRes);
      if (statusRes.config?.API_TIMEOUT_SECONDS) {
          api.setTimeout(statusRes.config.API_TIMEOUT_SECONDS);
      }
    } catch (e) { if (e.name !== 'CanceledError') console.error('Status fetch failed', e); }
  }, [session.user]);

  const fetchGlobalData = useCallback(async (signal) => {
    if (!session.user) return;
    try {
      const [pendingRes, mapRes] = await Promise.all([
        api.getSongs(signal, 'pending', 1, 1),
        api.getPlaylistMap(signal)
      ]);
      setPendingCount(pendingRes.total || 0);
      setPlaylistMap(mapRes);
    } catch (e) { if (e.name !== 'CanceledError') console.error('Global fetch failed', e); }
  }, [session.user]);

  const refreshAll = useCallback(() => {
      fetchStatus();
      fetchGlobalData();
  }, [fetchStatus, fetchGlobalData]);

  useEffect(() => {
    if (!session.user) return;
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;
    fetchStatus(signal);
    fetchGlobalData(signal);
    return () => abortControllerRef.current?.abort();
  }, [session.user, activeTab, fetchStatus, fetchGlobalData]);

  const handleLogin = () => {
    setSession({ checked: true, user: 'admin' });
    showNotification("Logged in successfully!");
  };

  const handleRescan = async () => {
    setIsRescanning(true);
    await api.triggerRescan();
    showNotification("Rescan triggered");
    setTimeout(refreshAll, 3000);
    setTimeout(() => setIsRescanning(false), 2000);
  };

  const navTo = (id) => {
    setActiveTab(id);
    if (isMobile) setIsSidebarOpen(false);
  };

  if (!session.checked) return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0c' }}><Music size={48} color="var(--accent)" className="spin" /></div>;
  if (!session.user) return <LoginPanel onLogin={handleLogin} notify={showNotification} />;

  const showBg = status?.config?.UI_DASHBOARD_BG === 'true';
  const themeColor = status?.config?.UI_THEME_COLOR || '#9b51e0';

  return (
    <div style={{ ...layout.container, backgroundImage: showBg && bgUrl ? `url(${bgUrl})` : 'none', backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat', position: 'relative' }}>
      <style>{`
        :root { --accent: ${themeColor}; }
        .nav-btn { border-left: 3px solid transparent !important; }
        .nav-btn-active { color: #fff !important; background: rgba(255,255,255,0.05) !important; border-left-color: var(--accent) !important; }
      `}</style>
      {showBg && bgUrl && <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(12px)', zIndex: 0 }}></div>}
      
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative', zIndex: 1 }}>
        {notification && <Toast message={notification.message} type={notification.type} onClose={() => setNotification(null)} />}

        <header style={{ ...layout.header, background: showBg ? 'rgba(30,30,35,0.4)' : layout.header.background, backdropFilter: showBg ? 'blur(12px)' : 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            className="animate-bounce"
            onClick={isMobile ? () => setIsSidebarOpen(v => !v) : undefined}
            style={{ ...layout.logo, overflow: 'hidden', cursor: isMobile ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            {isMobile && isSidebarOpen
              ? <X size={22} color="var(--accent)" />
              : <img src="/static/icon.png" alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            }
          </div>
          {!isMobile && (
            <div>
              <h1 style={{ fontSize: 18, margin: 0 }}>{t('app.title')}</h1>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: isLive ? 'var(--green)' : 'var(--red)', boxShadow: isLive ? '0 0 8px var(--green)' : 'none' }}></div>
                {isLive ? `SYSTEM ALIVE V${VERSION_NUMBER}${status?.debug ? ' DEBUGGING' : ''}` : 'SSE RECONNECTING...'}
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={i18n.language} onChange={(e) => i18n.changeLanguage(e.target.value)} style={{ padding: '6px', borderRadius: 4, background: 'var(--surface2)', color: '#fff', border: '1px solid var(--border)', fontSize: 12 }}>
            <option value="en">EN</option><option value="zh">ZH</option><option value="ja">JA</option>
          </select>
          <button onClick={handleRescan} disabled={isRescanning} style={{ ...layout.actionBtn, padding: isMobile ? '6px 8px' : '8px 16px' }}><RefreshCw size={14} className={isRescanning ? 'spin' : ''} /> {!isMobile && 'Rescan'}</button>
          {status?.config?.ALLOW_YTDLP && (
            <button onClick={() => { api.triggerCron(); refreshAll(); showNotification("Pipeline triggered"); }} style={{ ...layout.actionBtn, padding: isMobile ? '6px 8px' : '8px 16px' }}><Play size={14} /> {!isMobile && 'Run Pipeline'}</button>
          )}
        </div>
      </header>

      <div style={layout.main}>
          <nav style={{
            ...layout.sidebar,
            background: showBg ? 'rgba(20,20,25,0.4)' : layout.sidebar.background,
            backdropFilter: showBg ? 'blur(12px)' : 'none',
            ...(isMobile ? {
              width: isSidebarOpen ? 200 : 0,
              minWidth: 0,
              overflow: 'hidden',
              transition: 'width 0.3s ease',
              padding: isSidebarOpen ? '16px 0' : 0,
            } : {}),
          }}>
            <NavBtn id="library" icon={<Database size={18}/>} label={t('app.library')} active={activeTab} setter={navTo} />
            <NavBtn id="tagging" icon={<Tag size={18}/>} label={t('app.manual_tagging')} active={activeTab} count={pendingCount} setter={navTo} />
            {status?.config?.ALLOW_YTDLP && <NavBtn id="discovery" icon={<Download size={18}/>} label={t('app.downloads')} setter={navTo} active={activeTab} />}
            <NavBtn id="jobs" icon={<History size={18}/>} label={t('app.job_history')} active={activeTab} setter={navTo} />
            <NavBtn id="scheduler" icon={<Clock size={18}/>} label={t('app.scheduler')} active={activeTab} setter={navTo} />
            <NavBtn id="purge" icon={<Activity size={18}/>} label={t('app.purge_analysis')} active={activeTab} setter={navTo} />
            <NavBtn id="compilation" icon={<RefreshCw size={18}/>} label={t('app.compilation_merge')} active={activeTab} setter={navTo} />
            <NavBtn id="editor" icon={<Scissors size={18}/>} label={t('app.music_editor')} active={activeTab} setter={navTo} />
            <NavBtn id="settings" icon={<Settings size={18}/>} label={t('app.settings')} active={activeTab} setter={navTo} />
            <div style={{ marginTop: 'auto', padding: '10px 0' }}><StorageBar storage={status?.storage} /></div>
          </nav>

        <section key={activeTab} className="animate-fade" style={{ ...layout.content, flex: 1, padding: isMobile ? 12 : 24, background: showBg ? 'transparent' : layout.content.background }}>
          {activeTab === 'library' && (
            <div style={{ ...layout.grid2, flexDirection: isMobile ? 'column' : 'row' }}>
              <div style={{ flex: 2 }}>
                <div style={layout.sectionLabel}>Song Library</div>
                <SongTable playlistMap={playlistMap} config={status?.config} notify={showNotification} />
              </div>
              <div style={{ width: isMobile ? '100%' : 300, display: 'flex', flexDirection: 'column', gap: 16 }}>
                {status?.config?.NAVIDROME_URL && (
                  <a
                    href={status.config.NAVIDROME_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 16px', borderRadius: 6, border: '1px solid var(--accent)', background: 'transparent', color: 'var(--accent)', fontWeight: 600, fontSize: 13, textDecoration: 'none', cursor: 'pointer' }}
                  >
                    <ExternalLink size={14} /> Go to Navidrome
                  </a>
                )}
                <div>
                  <div style={layout.sectionLabel}>Playlist Protection</div>
                  <PlaylistSelector monitoredPlaylists={status?.config?.MONITORED_PLAYLISTS} onUpdate={fetchStatus} />
                </div>
              </div>
            </div>
          )}
          {activeTab === 'tagging' && <TaggingPanel config={status?.config} playlistMap={playlistMap} onUpdate={refreshAll} notify={showNotification} />}
          {activeTab === 'discovery' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
              <div style={{ background: 'var(--surface2)', padding: 20, borderRadius: 8 }}>
                <ManualDownload onJobStarted={refreshAll} notify={showNotification} />
              </div>
              <DiscoveryPanel notify={showNotification} />
            </div>
          )}
          {activeTab === 'jobs' && <JobsPanel notify={showNotification} />}
          {activeTab === 'scheduler' && <SchedulerPanel config={status?.config} onUpdate={fetchStatus} notify={showNotification} />}
          {activeTab === 'purge' && <PurgePreview config={status?.config} />}
          {activeTab === 'compilation' && <CompilationMergePanel config={status?.config} onUpdate={refreshAll} notify={showNotification} />}
          {activeTab === 'editor' && <MusicEditor config={status?.config} notify={showNotification} onUpdate={refreshAll} />}
          {activeTab === 'settings' && <SettingsPanel onUpdate={fetchStatus} notify={showNotification} onLogout={handleLogout} />}
        </section>
      </div>

      <footer style={{ ...layout.footer, height: isEventsOpen ? 240 : 40, overflow: 'hidden', background: showBg ? 'rgba(20,20,25,0.4)' : layout.footer.background, backdropFilter: showBg ? 'blur(12px)' : 'none', transition: 'height 0.4s ease', display: 'flex', flexDirection: 'column' }}>
        <div onClick={() => setIsEventsOpen(!isEventsOpen)} style={{ padding: '8px 24px', background: 'rgba(255,255,255,0.02)', fontSize: 10, fontWeight: 800, color: 'var(--text-dim)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 40, flexShrink: 0 }}>
          <span>LIVE EVENTS {isLive ? `(ALIVE V${VERSION_NUMBER})` : '(SSE RECONNECTING...)'}</span>
          <span style={{ transition: 'transform 0.3s ease', transform: isEventsOpen ? 'rotate(0deg)' : 'rotate(180deg)' }}>▼</span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', opacity: isEventsOpen ? 1 : 0, transition: 'opacity 0.2s ease' }}><LiveLog entries={entries} /></div>
      </footer>
     </div>
    </div>
  );
};

export default App;
