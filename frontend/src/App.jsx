import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from './api';
import { useSSE } from './hooks/useSSE';
import { 
  Settings, Music, Tag, History, Activity, 
  Database, HardDrive, RefreshCw, Plus, Play, Trash2, Download, Clock, X, CheckCircle, AlertCircle
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

const layout = {
  container: { height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)', color: 'var(--text)' },
  header: { padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface)' },
  main: { flex: 1, display: 'flex', overflow: 'hidden' },
  sidebar: { width: 240, borderRight: '1px solid var(--border)', padding: 16, display: 'flex', flexDirection: 'column', gap: 4, background: 'var(--surface)' },
  content: { flex: 1, padding: 24, overflowY: 'auto' },
  footer: { borderTop: '1px solid var(--border)', background: 'var(--surface)' },
  navBtn: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14, fontWeight: 500, width: '100%', textAlign: 'left' },
  actionBtn: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, color: '#fff', cursor: 'pointer', fontSize: 13 },
  logo: { width: 32, height: 32, background: 'var(--accent)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  sectionLabel: { fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-dim)', marginBottom: 16 },
  grid2: { display: 'flex', gap: 24 },
  badge: { marginLeft: 'auto', background: 'var(--accent)', color: '#fff', fontSize: 10, padding: '2px 6px', borderRadius: 10, fontWeight: 800 }
};

const NavBtn = ({ id, icon, label, active, setter, count }) => (
  <button onClick={() => setter(id)} style={{ ...layout.navBtn, color: active === id ? '#fff' : 'var(--text-dim)', background: active === id ? 'rgba(255,255,255,0.05)' : 'transparent' }}>
    {icon} <span>{label}</span>
    {count > 0 && <span style={layout.badge}>{count}</span>}
  </button>
);

const Toast = ({ message, type, onClose }) => (
  <div style={{
    position: 'fixed', top: 24, right: 24, zIndex: 1000,
    background: type === 'error' ? 'var(--red)' : 'var(--green)',
    color: '#fff', padding: '12px 20px', borderRadius: 8,
    boxShadow: '0 8px 16px rgba(0,0,0,0.3)',
    display: 'flex', alignItems: 'center', gap: 12,
    animation: 'slideIn 0.3s ease-out'
  }}>
    {type === 'error' ? <AlertCircle size={18} /> : <CheckCircle size={18} />}
    <span style={{ fontSize: 14, fontWeight: 600 }}>{message}</span>
    <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', padding: 4 }}>
      <X size={16} />
    </button>
  </div>
);

const App = () => {
  const { t, i18n } = useTranslation();
  const [activeTab, setActiveTab] = useState('library');
  const [status, setStatus] = useState(null);
  const [songs, setSongs] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [playlistMap, setPlaylistMap] = useState({});
  const [isRescanning, setIsRescanning] = useState(false);
  const [notification, setNotification] = useState(null);

  const { entries, isLive } = useSSE();

  const showNotification = useCallback((message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  }, []);

  const loadAll = useCallback(async () => {
    try {
      const [statusRes, songsRes, jobsRes, mapRes] = await Promise.all([
        api.getStatus(),
        api.getSongs(),
        api.getJobs(),
        api.getPlaylistMap()
      ]);
      setStatus(statusRes);
      setSongs(songsRes);
      setJobs(jobsRes);
      setPlaylistMap(mapRes);
    } catch (e) {
      console.error('Failed to load data', e);
    }
  }, []);

  useEffect(() => {
    loadAll();
    const interval = setInterval(loadAll, 15000);
    return () => clearInterval(interval);
  }, [loadAll]);

  const handleRescan = async () => {
    setIsRescanning(true);
    await api.triggerRescan();
    showNotification("Rescan triggered in Navidrome");
    setTimeout(() => setIsRescanning(false), 2000);
  };

  return (
    <div style={layout.container}>
      {notification && (
        <Toast 
          message={notification.message} 
          type={notification.type} 
          onClose={() => setNotification(null)} 
        />
      )}

      <header style={layout.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={layout.logo}>
            <Music size={20} color="#fff" />
          </div>
          <div>
            <h1 style={{ fontSize: 18, margin: 0 }}>{t('app.title')}</h1>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: isLive ? 'var(--green)' : 'var(--red)', boxShadow: isLive ? '0 0 8px var(--green)' : 'none' }}></div>
              {isLive ? 'SYSTEM LIVE' : 'CONNECTING...'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <select 
            value={i18n.language} 
            onChange={(e) => i18n.changeLanguage(e.target.value)}
            style={{ padding: '6px', borderRadius: 4, background: 'var(--surface2)', color: '#fff', border: '1px solid var(--border)' }}
          >
            <option value="en">English</option>
            <option value="zh">中文</option>
            <option value="ja">日本語</option>
          </select>
          <button onClick={handleRescan} disabled={isRescanning} style={layout.actionBtn}>
            <RefreshCw size={14} className={isRescanning ? 'spin' : ''} /> Rescan
          </button>
          <button onClick={() => { api.triggerCron(); showNotification("Pipeline triggered"); }} style={layout.actionBtn}>
            <Play size={14} /> Run Pipeline
          </button>
        </div>
      </header>

      <div style={layout.main}>
        <nav style={layout.sidebar}>
          <NavBtn id="library" icon={<Database size={18}/>} label={t('app.library')} active={activeTab} setter={setActiveTab} />
          <NavBtn id="tagging" icon={<Tag size={18}/>} label={t('app.manual_tagging')} active={activeTab} count={songs.filter(s => (s.needs_tagging || s.pending_confirmation) && s.status === 'active').length} setter={setActiveTab} />
          <NavBtn id="discovery" icon={<Download size={18}/>} label={t('app.downloads')} setter={setActiveTab} active={activeTab} />
          <NavBtn id="jobs" icon={<History size={18}/>} label={t('app.job_history')} active={activeTab} setter={setActiveTab} />
          <NavBtn id="scheduler" icon={<Clock size={18}/>} label={t('app.scheduler')} active={activeTab} setter={setActiveTab} />
          <NavBtn id="purge" icon={<Trash2 size={18}/>} label={t('app.purge_analysis')} active={activeTab} setter={setActiveTab} />
          <NavBtn id="settings" icon={<Settings size={18}/>} label={t('app.settings')} active={activeTab} setter={setActiveTab} />
          
          <div style={{ marginTop: 'auto', padding: '10px 0' }}>
            <StorageBar storage={status?.storage} />
          </div>
        </nav>

        <section style={layout.content}>
          {activeTab === 'library' && (
            <div style={layout.grid2}>
              <div style={{ flex: 2 }}>
                <div style={layout.sectionLabel}>Song Library</div>
                <SongTable songs={songs} playlistMap={playlistMap} />
              </div>
              <div>
                <div style={layout.sectionLabel}>Playlist Protection</div>
                <PlaylistSelector monitoredPlaylists={status?.config?.MONITORED_PLAYLISTS} onUpdate={loadAll} />
              </div>
            </div>
          )}

          {activeTab === 'tagging' && <TaggingPanel songs={songs} playlistMap={playlistMap} onUpdate={loadAll} notify={showNotification} />}
          {activeTab === 'discovery' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>

              <div style={{ background: 'var(--surface2)', padding: 20, borderRadius: 8 }}>
                <ManualDownload onJobStarted={loadAll} />
              </div>
              <DiscoveryPanel notify={showNotification} />
            </div>
          )}
          {activeTab === 'jobs' && <JobsPanel jobs={jobs} />}
          {activeTab === 'scheduler' && <SchedulerPanel config={status?.config} onUpdate={loadAll} notify={showNotification} />}
          {activeTab === 'purge' && <PurgePreview />}
          {activeTab === 'settings' && <SettingsPanel config={status?.config} onUpdate={loadAll} notify={showNotification} />}
        </section>
      </div>

      <footer style={layout.footer}>
        <LiveLog entries={entries} />
      </footer>
    </div>
  );
};

export default App;
