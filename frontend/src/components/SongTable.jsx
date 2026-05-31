import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ShieldCheck, ChevronDown, ChevronRight, Archive, ChevronLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ScrollingText } from './ScrollingText';
import { api } from '../api';

export const SongTable = ({ playlistMap = {}, config = {} }) => {
  const { t } = useTranslation();
  const [songs, setSongs] = useState([]);
  const [total, setTotal] = useState(0);
  const [activePage, setActivePage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('active'); // 'active' or 'moved'
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

  const renderPagination = () => {
    const totalPages = Math.ceil(total / pageSize);
    if (totalPages <= 1) return null;

    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 15, padding: '16px', background: 'rgba(255,255,255,0.02)', borderTop: '1px solid #222' }}>
        <button 
          disabled={activePage === 1 || isLoading} 
          onClick={() => setActivePage(prev => prev - 1)}
          style={{ background: 'transparent', border: 'none', color: activePage === 1 ? '#444' : 'var(--accent)', cursor: activePage === 1 ? 'default' : 'pointer' }}
        >
          <ChevronLeft size={20} />
        </button>
        <span style={{ fontSize: 13, fontWeight: 600 }}>
          {isLoading ? '...' : `Page ${activePage} / ${totalPages}`}
        </span>
        <button 
          disabled={activePage === totalPages || isLoading} 
          onClick={() => setActivePage(prev => prev + 1)}
          style={{ background: 'transparent', border: 'none', color: activePage === totalPages ? '#444' : 'var(--accent)', cursor: activePage === totalPages ? 'default' : 'pointer' }}
        >
          <ChevronRight size={20} />
        </button>
      </div>
    );
  };

  const renderRow = (song) => {
    const pls = playlistMap[song.filename.toLowerCase()] || [];
    return (
      <tr key={song.id} style={{ borderBottom: '1px solid #222', opacity: song.status === 'moved' ? 0.7 : 1 }}>
        <td style={tdStyle}>
          {song.status === 'moved' ? (
            <span style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Archive size={12} /> {t('song_table.archived')}
            </span>
          ) : song.needs_tagging ? (
            <span style={{ color: 'orange' }}>{t('song_table.untagged')}</span>
          ) : (
            <span style={{ color: 'var(--green)' }}>{t('song_table.ready')}</span>
          )}
        </td>
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
      </tr>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ background: 'var(--surface2)', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', background: 'rgba(255,255,255,0.02)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 12, fontWeight: 700 }}>{t('library.song_library')}</div>
            {statusFilter !== 'active' && (
                <button onClick={() => { setStatusFilter('active'); setActivePage(1); }} style={{ fontSize: 10, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 4, padding: '2px 8px', cursor: 'pointer' }}>Back to Active</button>
            )}
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.03)', textAlign: 'left' }}>
              <th style={thStyle}>{t('song_table.status')}</th>
              <th style={thStyle}>{t('song_table.title_artist')}</th>
              <th style={thStyle}>{t('song_table.playlists')}</th>
              <th style={thStyle}>{t('song_table.source')}</th>
            </tr>
          </thead>
          <tbody>
            {statusFilter === 'active' && !isLoading && songs.map(renderRow)}
            {statusFilter === 'active' && songs.length === 0 && !isLoading && (
              <tr>
                <td colSpan="4" style={{ padding: 20, textAlign: 'center', color: '#555' }}>{t('song_table.no_active')}</td>
              </tr>
            )}
            {isLoading && statusFilter === 'active' && (
                <tr>
                    <td colSpan="4" style={{ padding: 40, textAlign: 'center', color: 'var(--accent)' }}>Loading...</td>
                </tr>
            )}
          </tbody>
        </table>
        {statusFilter === 'active' && renderPagination()}
      </div>

      <div style={{ background: 'var(--surface2)', borderRadius: 8, overflow: 'hidden' }}>
          <div 
            onClick={() => {
                const nextShow = !showArchived;
                setShowArchived(nextShow);
                if (nextShow) {
                    setStatusFilter('moved');
                    setActivePage(1);
                } else {
                    setStatusFilter('active');
                    setActivePage(1);
                }
            }}
            style={{ 
              padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
              cursor: 'pointer', background: 'rgba(255,255,255,0.02)' 
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700, color: 'var(--text-dim)' }}>
              <Archive size={14} /> {t('song_table.archived_songs')}
            </div>
            {showArchived ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </div>
          
          {showArchived && (
            <>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <tbody>
                    {!isLoading && statusFilter === 'moved' && songs.map(renderRow)}
                    {isLoading && statusFilter === 'moved' && (
                        <tr>
                            <td colSpan="4" style={{ padding: 40, textAlign: 'center', color: 'var(--accent)' }}>Loading...</td>
                        </tr>
                    )}
                </tbody>
                </table>
                {statusFilter === 'moved' && renderPagination()}
            </>
          )}
        </div>
    </div>
  );
};

const thStyle = { padding: '12px 16px', fontWeight: 600, color: 'var(--text-dim)', fontSize: 11, textTransform: 'uppercase' };
const tdStyle = { padding: '12px 16px' };
