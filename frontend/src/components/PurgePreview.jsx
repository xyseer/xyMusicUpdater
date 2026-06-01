import React, { useEffect, useState, useRef, useCallback } from 'react';
import { api } from '../api';
import { ShieldCheck, Trash2, RefreshCw, Info, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ScrollingText } from './ScrollingText';

const Pagination = ({ page, totalPages, loading, onChange }) => {
  if (totalPages <= 1) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '10px 0 4px', borderTop: '1px solid rgba(255,255,255,0.05)', marginTop: 8 }}>
      <button
        disabled={page === 1 || loading}
        onClick={() => onChange(page - 1)}
        style={{ background: 'transparent', border: 'none', color: page === 1 ? '#444' : 'var(--accent)', cursor: page === 1 ? 'default' : 'pointer', padding: 4 }}
      >
        <ChevronLeft size={18} />
      </button>
      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dim)' }}>{loading ? '…' : `${page} / ${totalPages}`}</span>
      <button
        disabled={page === totalPages || loading}
        onClick={() => onChange(page + 1)}
        style={{ background: 'transparent', border: 'none', color: page === totalPages ? '#444' : 'var(--accent)', cursor: page === totalPages ? 'default' : 'pointer', padding: 4 }}
      >
        <ChevronRight size={18} />
      </button>
    </div>
  );
};

export const PurgePreview = ({ config = {} }) => {
  const { t } = useTranslation();
  const [data, setData] = useState({
    candidates: [], protected: [],
    candidates_total: 0, protected_total: 0,
    candidates_page: 1, protected_page: 1,
    debug_info: null,
  });
  const [loading, setLoading] = useState(true);
  const [candidatesPage, setCandidatesPage] = useState(1);
  const [protectedPage, setProtectedPage] = useState(1);
  const abortControllerRef = useRef(null);

  const configReady = config.DEFAULT_PAGE_SIZE !== undefined;
  const pageSize = parseInt(config.DEFAULT_PAGE_SIZE || 50);

  const load = useCallback(async (cPage, pPage, signal) => {
    setLoading(true);
    try {
      const res = await api.getUpcomingPurges(signal, cPage, pPage, pageSize);
      setData(res || { candidates: [], protected: [], candidates_total: 0, protected_total: 0, debug_info: null });
    } catch (e) {
      if (e.name !== 'CanceledError') console.error(e);
    } finally {
      setLoading(false);
    }
  }, [pageSize]);

  useEffect(() => {
    if (!configReady) return;
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();
    load(candidatesPage, protectedPage, abortControllerRef.current.signal);
    return () => abortControllerRef.current?.abort();
  }, [candidatesPage, protectedPage, load, configReady]);

  const candidatesTotal = data.candidates_total ?? data.candidates.length;
  const protectedTotal = data.protected_total ?? data.protected.length;
  const candidatesTotalPages = Math.max(1, Math.ceil(candidatesTotal / pageSize));
  const protectedTotalPages = Math.max(1, Math.ceil(protectedTotal / pageSize));

  if (loading && data.candidates.length === 0 && data.protected.length === 0) {
    return <div style={{ padding: 20 }}>{t('purge.analyzing')}</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, width: '100%', boxSizing: 'border-box' }}>

      {/* Header */}
      <div className="glass" style={{ padding: '20px 24px', borderRadius: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: 18 }}>{t('purge.title')}</h3>
          <p style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t('purge.desc')}</p>
        </div>
        <button onClick={() => { setCandidatesPage(1); setProtectedPage(1); }} style={refreshBtnStyle}>
          <RefreshCw size={16} style={{ marginRight: 8 }} /> {t('purge.reanalyze')}
        </button>
      </div>

      {/* System info */}
      {data.debug_info && (
        <div className="glass" style={{ padding: '12px 24px', borderRadius: 12, fontSize: 12, color: 'var(--text-dim)', display: 'flex', gap: 16, flexShrink: 0, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Info size={14} color="var(--accent)" />
            <span style={{ fontWeight: 800, letterSpacing: 1 }}>SYSTEM STATUS:</span>
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <div>{t('purge.monitored')}: <span style={{ color: 'var(--text)', fontWeight: 600 }}>{data.debug_info.monitored_playlists}</span></div>
            <div>{t('purge.tracks_found')}: <span style={{ color: 'var(--text)', fontWeight: 600 }}>{data.debug_info.total_playlist_tracks}</span></div>
          </div>
        </div>
      )}

      {/* Two columns with independent pagination */}
      <div style={{ display: 'flex', flexDirection: window.innerWidth <= 1024 ? 'column' : 'row', gap: 24, width: '100%' }}>

        {/* Deletion candidates */}
        <div className="glass" style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, borderRadius: 12 }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'rgba(235,87,87,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: '12px 12px 0 0' }}>
            <div style={{ ...sectionLabel, color: 'var(--red)' }}>
              <Trash2 size={14} /> {t('purge.deletion_candidates')}
            </div>
            <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--red)', background: 'rgba(235,87,87,0.1)', padding: '2px 8px', borderRadius: 10 }}>{candidatesTotal}</span>
          </div>

          <div style={{ padding: '10px 20px', flex: 1 }}>
            {data.candidates.length === 0
              ? <div style={emptyStyle}>{t('purge.no_candidates')}</div>
              : data.candidates.map((u, i) => (
                <div key={i} style={itemStyle}>
                  <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                    <ScrollingText text={u.filename} style={{ fontSize: 13, fontWeight: 600, color: '#eee' }} />
                    <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 4 }}>
                      Last modified: {new Date(u.mtime * 1000).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              ))
            }
          </div>

          <div style={{ padding: '0 20px 12px' }}>
            <Pagination
              page={candidatesPage}
              totalPages={candidatesTotalPages}
              loading={loading}
              onChange={setCandidatesPage}
            />
          </div>
        </div>

        {/* Protected */}
        <div className="glass" style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, borderRadius: 12 }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'rgba(52,199,89,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: '12px 12px 0 0' }}>
            <div style={{ ...sectionLabel, color: 'var(--green)' }}>
              <ShieldCheck size={14} /> {t('purge.protected')}
            </div>
            <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--green)', background: 'rgba(52,199,89,0.1)', padding: '2px 8px', borderRadius: 10 }}>{protectedTotal}</span>
          </div>

          <div style={{ padding: '10px 20px', flex: 1 }}>
            {data.protected.length === 0
              ? <div style={emptyStyle}>{t('purge.no_protected')}</div>
              : data.protected.map((u, i) => (
                <div key={i} style={itemStyle}>
                  <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                    <ScrollingText text={u.filename} style={{ fontSize: 13, fontWeight: 600, color: '#eee' }} />
                    <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 800, textTransform: 'uppercase', background: 'rgba(255,255,255,0.03)', padding: '1px 6px', borderRadius: 4 }}>
                        {u.match_reason}
                      </span>
                      {u.playlists.map(pl => (
                        <span key={pl} style={{ fontSize: 10, background: 'var(--accent)', padding: '1px 6px', borderRadius: 4, color: '#fff', fontWeight: 600 }}>{pl}</span>
                      ))}
                    </div>
                  </div>
                </div>
              ))
            }
          </div>

          <div style={{ padding: '0 20px 12px' }}>
            <Pagination
              page={protectedPage}
              totalPages={protectedTotalPages}
              loading={loading}
              onChange={setProtectedPage}
            />
          </div>
        </div>

      </div>
    </div>
  );
};

const sectionLabel = { fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 8 };
const itemStyle = { padding: '14px 0', borderBottom: '1px solid rgba(255,255,255,0.03)', display: 'flex', alignItems: 'center' };
const emptyStyle = { fontSize: 13, color: 'var(--text-dim)', padding: '40px 0', textAlign: 'center' };
const refreshBtnStyle = { background: 'var(--accent)', border: 'none', color: '#fff', borderRadius: 8, padding: '10px 20px', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', fontWeight: 700, boxShadow: '0 4px 12px rgba(0,0,0,0.2)' };
