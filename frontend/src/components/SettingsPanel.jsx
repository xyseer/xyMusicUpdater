import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { useTranslation } from 'react-i18next';

const inputGroup = { display: 'flex', flexDirection: 'column', gap: 5 };
const labelStyle = { fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase' };
const inputStyle = { padding: '8px 12px', borderRadius: 4, border: '1px solid var(--border)', background: '#1c1c21', color: '#fff' };
const saveBtnStyle = { padding: '8px 16px', borderRadius: 4, border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' };

export const SettingsPanel = ({ onUpdate, notify }) => {
  const { t } = useTranslation();
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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
      onUpdate();
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
        onUpdate();
      } catch (e) {
        notify("Cleanup failed: " + e.message, "error");
      }
    }
  };

  if (loading) return <div>Loading config...</div>;

  return (
    <div style={{ background: 'var(--surface2)', padding: 24, borderRadius: 8 }}>
      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <div style={inputGroup}>
            <label style={labelStyle}>{t('settings.max_storage_size')}</label>
            <input 
              type="number" 
              value={config.MAX_STORAGE_SIZE || 10} 
              onChange={e => setConfig({...config, MAX_STORAGE_SIZE: e.target.value})}
              style={inputStyle} 
            />
          </div>
          <div style={inputGroup}>
            <label style={labelStyle}>{t('settings.hold_period')}</label>
            <input 
              type="number" 
              value={config.HOLD_PERIOD_DAYS || 30} 
              onChange={e => setConfig({...config, HOLD_PERIOD_DAYS: e.target.value})}
              style={inputStyle} 
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <div style={inputGroup}>
            <label style={labelStyle}>{t('settings.max_deletions')}</label>
            <input 
              type="number" 
              value={config.MAX_DELETE_PER_PURGE || 100} 
              onChange={e => setConfig({...config, MAX_DELETE_PER_PURGE: e.target.value})}
              style={inputStyle} 
            />
          </div>
          <div style={inputGroup}>
            <label style={labelStyle}>{t('settings.max_songs')}</label>
            <input 
              type="number" 
              value={config.MAX_SONGS_PER_SOURCE || 100} 
              onChange={e => setConfig({...config, MAX_SONGS_PER_SOURCE: e.target.value})}
              style={inputStyle} 
            />
          </div>
          <div style={inputGroup}>
            <label style={labelStyle}>{t('settings.monitored_playlists')}</label>
            <input 
              value={config.MONITORED_PLAYLISTS || ''} 
              onChange={e => setConfig({...config, MONITORED_PLAYLISTS: e.target.value})}
              placeholder={t('settings.monitored_playlists_placeholder')}
              style={inputStyle} 
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <div style={inputGroup}>
            <label style={labelStyle}>{t('settings.navidrome_user')}</label>
            <input 
              value={config.NAVIDROME_USER || ''} 
              onChange={e => setConfig({...config, NAVIDROME_USER: e.target.value})}
              placeholder="e.g. admin"
              style={inputStyle} 
            />
          </div>
          <div style={inputGroup}>
            <label style={labelStyle}>{t('settings.navidrome_password')}</label>
            <input 
              type="password"
              value={config.NAVIDROME_PASSWORD === '********' ? '' : config.NAVIDROME_PASSWORD || ''} 
              onChange={e => setConfig({...config, NAVIDROME_PASSWORD: e.target.value})}
              placeholder={config.NAVIDROME_PASSWORD === '********' ? t('settings.password_set') : t('settings.password')}
              style={inputStyle} 
            />
          </div>
        </div>

        <div style={inputGroup}>
          <label style={labelStyle}>{t('settings.ytdlp_cookies')}</label>
          <textarea 
            value={config.YTDLP_COOKIES === '********' ? '' : config.YTDLP_COOKIES || ''} 
            onChange={e => setConfig({...config, YTDLP_COOKIES: e.target.value})}
            placeholder={config.YTDLP_COOKIES === '********' ? t('settings.ytdlp_cookies_placeholder_set') : t('settings.ytdlp_cookies_placeholder_empty')}
            style={{...inputStyle, minHeight: 80, fontFamily: 'monospace', fontSize: 11}} 
          />
          <div style={{fontSize: 10, color: 'var(--text-dim)'}}>{t('settings.ytdlp_cookies_hint')}</div>
        </div>

            <div style={inputGroup}>
              <label style={labelStyle}>{t('settings.ytdlp_proxy')}</label>
              <input 
                value={config.YTDLP_PROXY || ''} 
                onChange={e => setConfig({...config, YTDLP_PROXY: e.target.value})}
                placeholder={t('settings.ytdlp_proxy_placeholder')}
                style={inputStyle} 
              />
              <div style={{fontSize: 10, color: 'var(--text-dim)'}}>{t('settings.ytdlp_proxy_hint')}</div>
            </div>

            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 15}}>
              <div style={inputGroup}>
                <label style={labelStyle}>{t('settings.ytdlp_username')}</label>
                <input 
                  value={config.YTDLP_USERNAME || ''} 
                  onChange={e => setConfig({...config, YTDLP_USERNAME: e.target.value})}
                  placeholder={t('settings.username')}
                  style={inputStyle} 
                />
              </div>
              <div style={inputGroup}>
                <label style={labelStyle}>{t('settings.ytdlp_password')}</label>
                <input 
                  type="password"
                  value={config.YTDLP_PASSWORD === '********' ? '' : config.YTDLP_PASSWORD || ''} 
                  onChange={e => setConfig({...config, YTDLP_PASSWORD: e.target.value})}
                  placeholder={config.YTDLP_PASSWORD === '********' ? t('settings.password_set') : t('settings.password')}
                  style={inputStyle} 
                />
              </div>
            </div>

            <div style={{ borderTop: '1px solid #333', paddingTop: 20, display: 'flex', justifyContent: 'space-between' }}>
          <button type="submit" disabled={saving} style={saveBtnStyle}>
            {saving ? t('settings.saving') : t('settings.save_settings')}
          </button>
          
          <button 
            type="button" 
            onClick={handleCleanup}
            style={{ 
              padding: '8px 16px', borderRadius: 4, border: '1px solid #ff4d4d', 
              background: 'transparent', color: '#ff4d4d', cursor: 'pointer', fontWeight: 600 
            }}
          >
            {t('settings.cleanup_history')}
          </button>
        </div>
      </form>
    </div>
  );
};
