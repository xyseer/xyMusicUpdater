import React, { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api';
import { useTranslation } from 'react-i18next';
import { ScanLine, Trash2, X, ChevronLeft, ChevronRight, Music } from 'lucide-react';
import { ScrollingText } from './ScrollingText';
import defaultCover from '../assets/default-cover.svg';

const fmt = (s) => { if (!s) return '--:--'; const m = Math.floor(s / 60); return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`; };

export const DuplicatesPanel = ({ notify, config = {} }) => {
  const pageSize = parseInt(config.DEFAULT_pageSize || 10);
  const { t } = useTranslation();
  const [scanState, setScanState] = useState({ status: 'idle', scanned: 0, total: 0, fingerprinted: 0, group_count: 0 });
  const [groups, setGroups] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  // selected: { [group_id]: Set of nd_ids marked for DELETION }
  const [selected, setSelected] = useState({});
  const [confirming, setConfirming] = useState(null); // group_id being confirmed
  const pollRef = useRef(null);
  const abortRef = useRef(null);

  const fetchStatus = useCallback(async () => {
    try {
      const s = await api.getDuplicatesStatus();
      setScanState(s);
      return s.status;
    } catch { return 'idle'; }
  }, []);

  const fetchGroups = useCallback(async (p = page) => {
    setLoading(true);
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    try {
      const res = await api.getDuplicates(abortRef.current.signal, p, pageSize);
      setGroups(res.results || []);
      setTotal(res.total || 0);
      setScanState(prev => ({ ...prev, status: res.status }));

      // Default selection: mark all songs except the first one for deletion
      const newSel = {};
      (res.results || []).forEach(g => {
        if (!selected[g.id]) {
          newSel[g.id] = new Set(g.songs.slice(1).map(s => s.nd_id));
        }
      });
      setSelected(prev => ({ ...prev, ...newSel }));
    } catch (e) {
      if (e.name !== 'CanceledError') console.error(e);
    } finally {
      setLoading(false);
    }
  }, [page]); // eslint-disable-line

  useEffect(() => {
    fetchStatus().then(status => {
      if (status === 'done' || status === 'error') fetchGroups(1);
    });
  }, []); // eslint-disable-line

  useEffect(() => {
    fetchGroups(page);
  }, [page]); // eslint-disable-line

  // Poll while scan is running
  useEffect(() => {
    if (scanState.status !== 'running') {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    pollRef.current = setInterval(async () => {
      const status = await fetchStatus();
      if (status !== 'running') {
        clearInterval(pollRef.current);
        fetchGroups(1);
        setPage(1);
      }
    }, 2000);
    return () => clearInterval(pollRef.current);
  }, [scanState.status, fetchStatus, fetchGroups]);

  const handleScan = async () => {
    try {
      await api.startDuplicatesScan();
      setScanState(prev => ({ ...prev, status: 'running', scanned: 0 }));
      notify(t('duplicates.scan_started'));
    } catch (e) {
      notify(e.response?.data?.error || e.message, 'error');
    }
  };

  const toggleSong = (groupId, ndId) => {
    setSelected(prev => {
      const s = new Set(prev[groupId] || []);
      s.has(ndId) ? s.delete(ndId) : s.add(ndId);
      return { ...prev, [groupId]: s };
    });
  };

  const handleDelete = async (groupId) => {
    const toDelete = Array.from(selected[groupId] || []);
    if (!toDelete.length) { notify(t('duplicates.none_selected'), 'error'); return; }
    try {
      const res = await api.deleteDuplicates(toDelete);
      notify(t('duplicates.deleted', { count: res.deleted }));
      setConfirming(null);
      fetchGroups(page);
      fetchStatus();
    } catch (e) { notify(e.message, 'error'); }
  };

  const handleDismiss = async (groupId) => {
    try {
      await api.dismissDuplicateGroup(groupId);
      setGroups(prev => prev.filter(g => g.id !== groupId));
      setTotal(prev => Math.max(0, prev - 1));
    } catch (e) { notify(e.message, 'error'); }
  };

  const isRunning = scanState.status === 'running';
  const isDone = scanState.status === 'done';
  const totalPages = Math.ceil(total / pageSize);
  const pct = scanState.total > 0 ? Math.round((scanState.scanned / scanState.total) * 100) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header card */}
      <div style={{ background: 'var(--surface2)', padding: 20, borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{t('duplicates.title')}</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>{t('duplicates.desc')}</div>
          </div>
          <button
            onClick={handleScan}
            disabled={isRunning}
            style={{ padding: '9px 18px', borderRadius: 6, border: 'none', background: isRunning ? '#333' : 'var(--accent)', color: '#fff', cursor: isRunning ? 'default' : 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <ScanLine size={15} className={isRunning ? 'spin' : ''} />
            {isRunning ? t('duplicates.scanning') : t('duplicates.scan')}
          </button>
        </div>

        {/* Progress bar */}
        {isRunning && (
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6 }}>
              {t('duplicates.progress', { scanned: scanState.scanned, total: scanState.total })}
              {scanState.fingerprinted > 0 && <span style={{ color: 'var(--accent)', marginLeft: 8 }}>({scanState.fingerprinted} fingerprinted)</span>}
            </div>
            <div style={{ height: 6, background: '#222', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)', borderRadius: 4, transition: 'width 0.4s ease' }} />
            </div>
          </div>
        )}

        {/* Summary */}
        {isDone && (
          <div style={{ fontSize: 12, color: total > 0 ? 'var(--red)' : 'var(--green)' }}>
            {total > 0 ? t('duplicates.groups_found', { count: total }) : t('duplicates.no_duplicates')}
          </div>
        )}
      </div>

      {/* Groups list */}
      {groups.map(group => {
        const toDeleteCount = (selected[group.id] || new Set()).size;
        return (
          <div key={group.id} style={{ background: 'var(--surface2)', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
            {/* Group header */}
            <div style={{ padding: '12px 16px', background: 'rgba(235,87,87,0.06)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                {group.songs.length} {t('duplicates.tracks')} • {t('duplicates.marked_delete', { count: toDeleteCount })}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => handleDismiss(group.id)}
                  style={{ padding: '5px 12px', borderRadius: 4, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <X size={12} /> {t('duplicates.dismiss')}
                </button>
                {confirming === group.id ? (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: 'var(--red)' }}>{t('duplicates.confirm_delete', { count: toDeleteCount })}</span>
                    <button onClick={() => handleDelete(group.id)} style={{ padding: '5px 12px', borderRadius: 4, border: 'none', background: 'var(--red)', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>{t('duplicates.confirm_yes')}</button>
                    <button onClick={() => setConfirming(null)} style={{ padding: '5px 12px', borderRadius: 4, border: '1px solid var(--border)', background: 'transparent', color: '#fff', cursor: 'pointer', fontSize: 12 }}>{t('duplicates.cancel')}</button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirming(group.id)}
                    disabled={toDeleteCount === 0}
                    style={{ padding: '5px 12px', borderRadius: 4, border: 'none', background: toDeleteCount > 0 ? 'var(--red)' : '#333', color: '#fff', cursor: toDeleteCount > 0 ? 'pointer' : 'default', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    <Trash2 size={12} /> {t('duplicates.delete_selected')} {toDeleteCount > 0 && `(${toDeleteCount})`}
                  </button>
                )}
              </div>
            </div>

            {/* Songs */}
            {group.songs.map((song, idx) => {
              const markedDelete = (selected[group.id] || new Set()).has(song.nd_id);
              return (
                <div
                  key={song.nd_id}
                  onClick={() => toggleSong(group.id, song.nd_id)}
                  style={{
                    padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12,
                    borderBottom: idx < group.songs.length - 1 ? '1px solid #1a1a1a' : 'none',
                    background: markedDelete ? 'rgba(235,87,87,0.06)' : 'transparent',
                    cursor: 'pointer', transition: 'background 0.15s',
                  }}
                >
                  <img
                    src={`/api/nd-cover/${song.nd_id}/`}
                    style={{ width: 36, height: 36, borderRadius: 4, objectFit: 'cover', background: '#333', flexShrink: 0, opacity: markedDelete ? 0.4 : 1 }}
                    loading="lazy"
                    onError={e => { e.target.src = defaultCover; }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <ScrollingText text={song.title || song.path?.split('/').pop() || '—'} style={{ fontSize: 13, fontWeight: 600, textDecoration: markedDelete ? 'line-through' : 'none', color: markedDelete ? 'var(--text-dim)' : 'var(--text)' }} />
                    <ScrollingText text={song.artist || '—'} style={{ fontSize: 11, color: 'var(--text-dim)' }} />
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', flexShrink: 0 }}>{fmt(song.duration)}</div>
                  <div style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${markedDelete ? 'var(--red)' : 'var(--green)'}`, background: markedDelete ? 'rgba(235,87,87,0.2)' : 'rgba(39,174,96,0.15)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {markedDelete
                      ? <Trash2 size={9} color="var(--red)" />
                      : <Music size={9} color="var(--green)" />
                    }
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}

      {loading && <div style={{ textAlign: 'center', padding: 40, color: 'var(--accent)' }}>Loading...</div>}

      {isDone && !loading && groups.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)', background: 'var(--surface2)', borderRadius: 8 }}>
          {t('duplicates.no_results')}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 15, padding: '8px 0' }}>
          <button disabled={page === 1 || loading} onClick={() => setPage(p => p - 1)}
            style={{ background: 'transparent', border: 'none', color: page === 1 ? '#444' : 'var(--accent)', cursor: page === 1 ? 'default' : 'pointer' }}>
            <ChevronLeft size={20} />
          </button>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{page} / {totalPages}</span>
          <button disabled={page === totalPages || loading} onClick={() => setPage(p => p + 1)}
            style={{ background: 'transparent', border: 'none', color: page === totalPages ? '#444' : 'var(--accent)', cursor: page === totalPages ? 'default' : 'pointer' }}>
            <ChevronRight size={20} />
          </button>
        </div>
      )}
    </div>
  );
};
