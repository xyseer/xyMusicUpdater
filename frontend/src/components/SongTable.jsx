import React, { useState } from 'react';
import { ShieldCheck, Music, ChevronDown, ChevronRight, Archive } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export const SongTable = ({ songs, playlistMap = {} }) => {
  const { t } = useTranslation();
  const [showArchived, setShowArchived] = useState(false);

  const activeSongs = songs.filter(s => s.status === 'active');
  const archivedSongs = songs.filter(s => s.status === 'moved');

  const getPlaylists = (filename) => {
    return playlistMap[filename.toLowerCase()] || [];
  };

  const renderRow = (song) => {
    const pls = getPlaylists(song.filename);
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
        <td style={tdStyle}>
          <div style={{ fontWeight: 600 }}>{song.title || song.filename}</div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{song.artist}</div>
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
            {activeSongs.map(renderRow)}
            {activeSongs.length === 0 && (
              <tr>
                <td colSpan="4" style={{ padding: 20, textAlign: 'center', color: '#555' }}>{t('song_table.no_active')}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {archivedSongs.length > 0 && (
        <div style={{ background: 'var(--surface2)', borderRadius: 8, overflow: 'hidden' }}>
          <div 
            onClick={() => setShowArchived(!showArchived)}
            style={{ 
              padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
              cursor: 'pointer', background: 'rgba(255,255,255,0.02)' 
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700, color: 'var(--text-dim)' }}>
              <Archive size={14} /> {t('song_table.archived_songs')} ({archivedSongs.length})
            </div>
            {showArchived ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </div>
          
          {showArchived && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <tbody>
                {archivedSongs.map(renderRow)}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
};

const thStyle = { padding: '12px 16px', fontWeight: 600, color: 'var(--text-dim)', fontSize: 11, textTransform: 'uppercase' };
const tdStyle = { padding: '12px 16px' };
