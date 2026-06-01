import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ShieldCheck, ChevronDown, ChevronRight, Archive, ChevronLeft, Trash2, Tag } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ScrollingText } from './ScrollingText';
import { api } from '../api';
import { useIsMobile } from '../hooks/useIsMobile';

export const SongTable = ({ playlistMap = {}, config = {}, notify }) => {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [songs, setSongs] = useState([]);
  const [total, setTotal] = useState(0);
  const [activePage, setActivePage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('active');
  const [isLoading, setIsLoading] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const abortControllerRef = useRef(null);
  const configReady = config.DEFAULT_PAGE_SIZE !== undefined;
  const pageSize = parseInt(config.DEFAULT_PAGE_SIZE || 50);

  const fetchPage = useCallback(async (page, status, signal) => {
    setIsLoading(true);
    try {
      const res = await api.getSongs(signal, status, page, pageSize);
      setSongs(res.results || []);
      setTotal(res.total || 0);
    } catch (e) {
      if (e.name !== 'CanceledError') console.error('Failed to fetch songs', e);
    } finally {
      setIsLoading(false);
    }
  }, [pageSize]);

  useEffect(() => {
    if (!configReady) return;
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();
    fetchPage(activePage, statusFilter, abortControllerRef.current.signal);
    return () => abortControllerRef.current?.abort();
  }, [activePage, statusFilter, fetchPage, configReady]);

  const handleDelete = async (id) => {
    try {
      await api.deleteSong(id);
      setSongs(prev => prev.filter(s => s.id !== id));
      setTotal(prev => Math.max(0, prev - 1));
      if (notify) notify("Deleted");
    } catch (e) { if (notify) notify("Delete failed: " + e.message, "error"); }
  };

  const handleRetag = async (id) => {
    try {
      await api.stageSong(id, { needs_tagging: true, pending_confirmation: false });
      setSongs(prev => prev.map(s => s.id === id ? { ...s, needs_tagging: true, pending_confirmation: false } : s));
      if (notify) notify("Marked for re-tagging");
    } catch (e) { if (notify) notify("Failed: " + e.message, "error"); }
  };

  const renderPagination = () => {
    const totalPages = Math.ceil(total / pageSize);
    if (totalPages <= 1) return null;
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 15, padding: '16px', background: 'rgba(255,255,255,0.02)', borderTop: '1px solid #222' }}>
        <button disabled={activePage === 1 || isLoading} onClick={() => setActivePage(prev => prev - 1)}
          style={{ background: 'transparent', border: 'none', color: activePage === 1 ? '#444' : 'var(--accent)', cursor: activePage === 1 ? 'default' : 'pointer' }}>
          <ChevronLeft size={20} />
        </button>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{isLoading ? '...' : `Page ${activePage} / ${totalPages}`}</span>
        <button disabled={activePage === totalPages || isLoading} onClick={() => setActivePage(prev => prev + 1)}
          style={{ background: 'transparent', border: 'none', color: activePage === totalPages ? '#444' : 'var(--accent)', cursor: activePage === totalPages ? 'default' : 'pointer' }}>
          <ChevronRight size={20} />
        </button>
      </div>
    );
  };

  const StatusBadge = ({ song }) => {
    if (song.status === 'moved') return <span style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 3, fontSize: 11 }}><Archive size={11} /> {t('song_table.archived')}</span>;
    if (song.needs_tagging) return <span style={{ color: 'orange', fontSize: 11 }}>{t('song_table.untagged')}</span>;
    return <span style={{ color: 'var(--green)', fontSize: 11 }}>{t('song_table.ready')}</span>;
  };

  // Mobile card view
  const renderCard = (song) => {
    const pls = playlistMap[song.filename.toLowerCase()] || [];
    return (
      <div key={song.id} style={{ padding: '12px 14px', borderBottom: '1px solid #222', opacity: song.status === 'moved' ? 0.7 : 1 }}>
        <ScrollingText text={song.title || song.filename} style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }} />
        <ScrollingText text={song.artist} style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 6 }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <StatusBadge song={song} />
            {song.source && <span style={{ fontSize: 10, color: '#555' }}>{song.source}</span>}
            {pls.map(p => (
              <span key={p} style={{ background: 'var(--accent)', color: '#fff', fontSize: 9, padding: '1px 5px', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 3 }}>
                <ShieldCheck size={9} /> {p}
              </span>
            ))}
          </div>
          {song.status !== 'moved' && (
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => handleRetag(song.id)} style={{ padding: '4px 10px', borderRadius: 4, border: '1px solid var(--accent)', background: 'transparent', color: 'var(--accent)', cursor: 'pointer', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Tag size={11} /> {t('song_table.retag')}
              </button>
              <button onClick={() => handleDelete(song.id)} style={{ padding: '4px 10px', borderRadius: 4, border: '1px solid #ff4d4d', background: 'transparent', color: '#ff4d4d', cursor: 'pointer', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Trash2 size={11} /> {t('song_table.delete')}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Desktop table row
  const renderRow = (song) => {
    const pls = playlistMap[song.filename.toLowerCase()] || [];
    return (
      <tr key={song.id} style={{ borderBottom: '1px solid #222', opacity: song.status === 'moved' ? 0.7 : 1 }}>
        <td style={tdStyle}><StatusBadge song={song} /></td>
        <td style={{ ...tdStyle, maxWidth: 280 }}>
          <ScrollingText text={song.title || song.filename} style={{ fontWeight: 600 }} />
          <ScrollingText text={song.artist} style={{ fontSize: 11, color: 'var(--text-dim)' }} />
        </td>
        <td style={tdStyle}>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {pls.map(p => (
              <span key={p} style={{ background: 'var(--accent)', color: '#fff', fontSize: 10, padding: '1px 6px', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                <ShieldCheck size={10} /> {p}
              </span>
            ))}
            {pls.length === 0 && <span style={{ color: '#555' }}>-</span>}
          </div>
        </td>
        <td style={tdStyle}>{song.source}</td>
        {song.status !== 'moved' && (
          <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
            <button onClick={() => handleRetag(song.id)} style={{ padding: '3px 8px', marginRight: 4, borderRadius: 4, border: '1px solid var(--accent)', background: 'transparent', color: 'var(--accent)', cursor: 'pointer', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Tag size={11} /> {t('song_table.retag')}
            </button>
            <button onClick={() => handleDelete(song.id)} style={{ padding: '3px 8px', borderRadius: 4, border: '1px solid #ff4d4d', background: 'transparent', color: '#ff4d4d', cursor: 'pointer', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Trash2 size={11} /> {t('song_table.delete')}
            </button>
          </td>
        )}
        {song.status === 'moved' && <td style={tdStyle} />}
      </tr>
    );
  };

  const renderSongs = (filterStatus) => {
    if (isLoading) return isMobile
      ? <div style={{ padding: 40, textAlign: 'center', color: 'var(--accent)' }}>Loading...</div>
      : <tr><td colSpan="5" style={{ padding: 40, textAlign: 'center', color: 'var(--accent)' }}>Loading...</td></tr>;

    if (songs.length === 0 && filterStatus === 'active') return isMobile
      ? <div style={{ padding: 20, textAlign: 'center', color: '#555', fontSize: 13 }}>{t('song_table.no_active')}</div>
      : <tr><td colSpan="5" style={{ padding: 20, textAlign: 'center', color: '#555' }}>{t('song_table.no_active')}</td></tr>;

    return songs.map(isMobile ? renderCard : renderRow);
  };

  const SongList = ({ filterStatus }) => isMobile ? (
    <div>{renderSongs(filterStatus)}</div>
  ) : (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 480 }}>
        {filterStatus === 'active' && (
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.03)', textAlign: 'left' }}>
              <th style={thStyle}>{t('song_table.status')}</th>
              <th style={thStyle}>{t('song_table.title_artist')}</th>
              <th style={thStyle}>{t('song_table.playlists')}</th>
              <th style={thStyle}>{t('song_table.source')}</th>
              <th style={thStyle}>{t('song_table.actions')}</th>
            </tr>
          </thead>
        )}
        <tbody>{renderSongs(filterStatus)}</tbody>
      </table>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ background: 'var(--surface2)', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', background: 'rgba(255,255,255,0.02)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 12, fontWeight: 700 }}>{t('library.song_library')}</div>
          {statusFilter !== 'active' && (
            <button onClick={() => { setStatusFilter('active'); setActivePage(1); }} style={{ fontSize: 10, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 4, padding: '2px 8px', cursor: 'pointer' }}>Back to Active</button>
          )}
        </div>
        {statusFilter === 'active' && <SongList filterStatus="active" />}
        {statusFilter === 'active' && renderPagination()}
      </div>

      <div style={{ background: 'var(--surface2)', borderRadius: 8, overflow: 'hidden' }}>
        <div
          onClick={() => {
            const next = !showArchived;
            setShowArchived(next);
            setStatusFilter(next ? 'moved' : 'active');
            setActivePage(1);
          }}
          style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', background: 'rgba(255,255,255,0.02)' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700, color: 'var(--text-dim)' }}>
            <Archive size={14} /> {t('song_table.archived_songs')}
          </div>
          {showArchived ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </div>
        {showArchived && (
          <>
            <SongList filterStatus="moved" />
            {statusFilter === 'moved' && renderPagination()}
          </>
        )}
      </div>
    </div>
  );
};

const thStyle = { padding: '12px 16px', fontWeight: 600, color: 'var(--text-dim)', fontSize: 11, textTransform: 'uppercase' };
const tdStyle = { padding: '12px 16px' };
