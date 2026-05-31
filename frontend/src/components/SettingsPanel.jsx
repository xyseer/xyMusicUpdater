import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { useTranslation } from 'react-i18next';
import { LogOut, Upload } from 'lucide-react';

const inputGroup = { display: 'flex', flexDirection: 'column', gap: 5 };
const labelStyle = { fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase' };
const inputStyle = { padding: '8px 12px', borderRadius: 4, border: '1px solid var(--border)', background: '#1c1c21', color: '#fff' };
const saveBtnStyle = { padding: '8px 16px', borderRadius: 4, border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' };

export const SettingsPanel = ({ onUpdate, notify, onLogout }) => {
  const { t } = useTranslation();
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingBg, setUploadingBg] = useState(false);

  useEffect(() => {
    api.getConfig().then(data => {
      setConfig(data);
      setLoading(false);
    });
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.updateConfig(config);
      notify("Settings saved successfully!");
      if (onUpdate) onUpdate();
    } catch (e) {
      notify("Failed to save settings: " + e.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleCleanup = async () => {
    if (window.confirm("Clean up deleted song history?")) {
      try {
        const res = await api.cleanupHistory(0);
        notify(`Cleanup complete. Removed ${res.count} records.`);
        if (onUpdate) onUpdate();
      } catch (e) {
        notify("Cleanup failed: " + e.message, "error");
      }
    }
  };

  const handleBackgroundUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingBg(true);
    try {
      await api.uploadBackground(file);
      notify("Background updated!");
    } catch (err) {
      notify("Background upload failed.", "error");
    } finally {
      setUploadingBg(false);
    }
  };

  if (loading) return <div>Loading config...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ background: 'var(--surface2)', padding: 24, borderRadius: 8 }}>
        <h3 style={{ margin: '0 0 20px 0', borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>Appearance & System</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <div style={inputGroup}>
            <label style={labelStyle}>Login Background Image</label>
            <label style={{ ...saveBtnStyle, background: 'var(--surface)', border: '1px solid var(--border)', cursor: 'pointer' }}>
                <Upload size={16} style={{ marginRight: 8 }} />
                {uploadingBg ? 'Uploading...' : 'Upload Image'}
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleBackgroundUpload} disabled={uploadingBg} />
            </label>
          </div>
          <div style={inputGroup}>
            <label style={labelStyle}>Account Actions</label>
            <button onClick={onLogout} style={{ ...saveBtnStyle, background: 'transparent', border: '1px solid #ff4d4d', color: '#ff4d4d' }}><LogOut size={16} style={{ marginRight: 8 }} /> Logout</button>
          </div>
        </div>
        <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <input type="checkbox" id="showDashboardBg" checked={config.UI_DASHBOARD_BG === 'true'} onChange={e => setConfig({...config, UI_DASHBOARD_BG: e.target.checked ? 'true' : 'false'})} />
            <label htmlFor="showDashboardBg" style={{ ...labelStyle, fontSize: 13 }}>{t('settings.show_dashboard_bg')}</label>
          </div>
          <div style={inputGroup}>
            <label style={labelStyle}>{t('settings.theme_color')}</label>
            <div style={{ display: 'flex', gap: 8 }}>
                <input type="color" value={config.UI_THEME_COLOR || '#9b51e0'} onChange={e => setConfig({...config, UI_THEME_COLOR: e.target.value})} style={{ width: 40, height: 34, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }} />
                <input type="text" value={config.UI_THEME_COLOR || '#9b51e0'} onChange={e => setConfig({...config, UI_THEME_COLOR: e.target.value})} style={{ ...inputStyle, flex: 1, fontFamily: 'monospace' }} />
            </div>
          </div>
        </div>
      </div>

      <div style={{ background: 'var(--surface2)', padding: 24, borderRadius: 8 }}>
        <h3 style={{ margin: '0 0 20px 0', borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>Core Settings</h3>
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            <div style={inputGroup}>
              <label style={labelStyle}>{t('settings.max_storage_size')}</label>
              <input type="number" value={config.MAX_STORAGE_SIZE || 10} onChange={e => setConfig({...config, MAX_STORAGE_SIZE: e.target.value})} style={inputStyle} />
            </div>
            <div style={inputGroup}>
              <label style={labelStyle}>{t('settings.hold_period')}</label>
              <input type="number" value={config.HOLD_PERIOD_DAYS || 30} onChange={e => setConfig({...config, HOLD_PERIOD_DAYS: e.target.value})} style={inputStyle} />
            </div>
            <div style={inputGroup}>
              <label style={labelStyle}>{t('settings.max_deletions')}</label>
              <input type="number" value={config.MAX_DELETE_PER_PURGE || 100} onChange={e => setConfig({...config, MAX_DELETE_PER_PURGE: e.target.value})} style={inputStyle} />
            </div>
            <div style={inputGroup}>
              <label style={labelStyle}>{t('settings.max_songs')}</label>
              <input type="number" value={config.MAX_SONGS_PER_SOURCE || 100} onChange={e => setConfig({...config, MAX_SONGS_PER_SOURCE: e.target.value})} style={inputStyle} />
            </div>
            <div style={inputGroup}>
              <label style={labelStyle}>{t('settings.api_timeout')}</label>
              <input type="number" value={config.API_TIMEOUT_SECONDS || 15} onChange={e => setConfig({...config, API_TIMEOUT_SECONDS: e.target.value})} style={inputStyle} />
            </div>
            <div style={inputGroup}>
              <label style={labelStyle}>{t('settings.default_page_size')}</label>
              <input type="number" value={config.DEFAULT_PAGE_SIZE || 50} onChange={e => setConfig({...config, DEFAULT_PAGE_SIZE: e.target.value})} style={inputStyle} />
            </div>
            <div style={inputGroup}>
              <label style={labelStyle}>{t('settings.acoustid_api_key')}</label>
              <input
                type="password"
                value={config.ACOUSTID_API_KEY === '********' ? '' : (config.ACOUSTID_API_KEY || '')}
                placeholder={config.ACOUSTID_API_KEY ? t('settings.password_set') : 'e.g. jibUs9nijT'}
                onChange={e => setConfig({...config, ACOUSTID_API_KEY: e.target.value})}
                style={inputStyle}
              />
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>{t('settings.acoustid_hint')}</div>
            </div>
            <div style={inputGroup}>
              <label style={labelStyle}>{t('settings.monitored_playlists')}</label>
              <input value={config.MONITORED_PLAYLISTS || ''} onChange={e => setConfig({...config, MONITORED_PLAYLISTS: e.target.value})} placeholder={t('settings.monitored_playlists_placeholder')} style={inputStyle} />
            </div>
          </div>

          <div style={inputGroup}>
            <label style={labelStyle}>{t('settings.navidrome_url')}</label>
            <input value={config.NAVIDROME_URL || ''} onChange={e => setConfig({...config, NAVIDROME_URL: e.target.value})} placeholder="e.g. http://localhost:4533" style={inputStyle} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            <div style={inputGroup}>
              <label style={labelStyle}>{t('settings.navidrome_user')}</label>
              <input value={config.NAVIDROME_USER || ''} onChange={e => setConfig({...config, NAVIDROME_USER: e.target.value})} placeholder="e.g. admin" style={inputStyle} />
            </div>
            <div style={inputGroup}>
              <label style={labelStyle}>{t('settings.navidrome_password')}</label>
              <input type="password" value={config.NAVIDROME_PASSWORD === '********' ? '' : config.NAVIDROME_PASSWORD || ''} onChange={e => setConfig({...config, NAVIDROME_PASSWORD: e.target.value})} placeholder={config.NAVIDROME_PASSWORD === '********' ? t('settings.password_set') : t('settings.password')} style={inputStyle} />
            </div>
          </div>

          <div style={inputGroup}>
            <label style={labelStyle}>{t('settings.ytdlp_cookies')}</label>
            <textarea value={config.YTDLP_COOKIES === '********' ? '' : config.YTDLP_COOKIES || ''} onChange={e => setConfig({...config, YTDLP_COOKIES: e.target.value})} placeholder={config.YTDLP_COOKIES === '********' ? t('settings.ytdlp_cookies_placeholder_set') : t('settings.ytdlp_cookies_placeholder_empty')} style={{...inputStyle, minHeight: 80, fontFamily: 'monospace', fontSize: 11}} />
          </div>

          <div style={inputGroup}>
            <label style={labelStyle}>{t('settings.ytdlp_proxy')}</label>
            <input value={config.YTDLP_PROXY || ''} onChange={e => setConfig({...config, YTDLP_PROXY: e.target.value})} placeholder={t('settings.ytdlp_proxy_placeholder')} style={inputStyle} />
          </div>

          <div style={{ borderTop: '1px solid #333', paddingTop: 20, display: 'flex', justifyContent: 'space-between' }}>
            <button type="submit" disabled={saving} style={saveBtnStyle}>{saving ? t('settings.saving') : t('settings.save_settings')}</button>
            <button type="button" onClick={handleCleanup} style={{ padding: '8px 16px', borderRadius: 4, border: '1px solid #ff4d4d', background: 'transparent', color: '#ff4d4d', cursor: 'pointer', fontWeight: 600 }}>{t('settings.cleanup_history')}</button>
          </div>
        </form>
      </div>
    </div>
  );
};
