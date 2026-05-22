import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { ShieldCheck, Trash2, RefreshCw, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export const PurgePreview = () => {
  const { t } = useTranslation();
  const [data, setData] = useState({ candidates: [], protected: [], debug_info: null });
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.getUpcomingPurges();
      setData(res || { candidates: [], protected: [], debug_info: null });
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div style={{ background: 'var(--surface2)', padding: 16, borderRadius: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h4 style={{ margin: 0, fontSize: 14 }}>{t('purge.title')}</h4>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{t('purge.desc')}</span>
        </div>
        <button onClick={load} style={refreshBtnStyle}>
          <RefreshCw size={14} style={{ marginRight: 6 }} /> {t('purge.reanalyze')}
        </button>
      </div>

      {loading ? <div>{t('purge.analyzing')}</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          
          {/* Debug/Info Box */}
          {data.debug_info && (
            <div style={{ background: 'rgba(155,81,224,0.05)', border: '1px solid var(--accent)', padding: 10, borderRadius: 4, fontSize: 11 }}>
              <div style={{ fontWeight: 800, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Info size={12} /> {t('purge.sys_debug')}
              </div>
              <div>{t('purge.monitored')} {data.debug_info.monitored_playlists}</div>
              <div>{t('purge.tracks_found')} {data.debug_info.total_playlist_tracks}</div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            {/* Candidates for Deletion */}
            <div>
              <div style={{ ...sectionLabel, color: 'var(--red)' }}>{t('purge.deletion_candidates')} ({data.candidates.length})</div>
              <div style={listContainer}>
                {data.candidates.length === 0 && <div style={emptyStyle}>{t('purge.no_candidates')}</div>}
                {data.candidates.map((u, i) => (
                  <div key={i} style={itemStyle}>
                    <Trash2 size={12} color="var(--red)" style={{ flexShrink: 0 }} />
                    <div style={filenameStyle}>{u.filename}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Protected Songs */}
            <div>
              <div style={{ ...sectionLabel, color: 'var(--green)' }}>{t('purge.protected')} ({data.protected.length})</div>
              <div style={listContainer}>
                {data.protected.length === 0 && <div style={emptyStyle}>{t('purge.no_protected')}</div>}
                {data.protected.map((u, i) => (
                  <div key={i} style={itemStyle}>
                    <ShieldCheck size={12} color="var(--green)" style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                      <div style={filenameStyle}>{u.filename}</div>
                      <div style={{ fontSize: 10, color: 'var(--accent)' }}>{t('purge.matched_via')} {u.match_reason}</div>
                      <div style={{ fontSize: 10, color: '#aaa' }}>{t('purge.playlists')} {u.playlists.join(', ')}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const sectionLabel = { fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 };
const listContainer = { maxHeight: 400, overflowY: 'auto', background: 'rgba(0,0,0,0.2)', borderRadius: 4, padding: 8 };
const itemStyle = { display: 'flex', gap: 10, alignItems: 'flex-start', padding: '6px 0', borderBottom: '1px solid #333' };
const filenameStyle = { fontSize: 12, wordBreak: 'break-all', color: '#eee' };
const emptyStyle = { fontSize: 12, color: '#666', padding: '10px 0', textAlign: 'center' };
const refreshBtnStyle = { background: 'transparent', border: '1px solid #444', color: '#888', borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center' };
