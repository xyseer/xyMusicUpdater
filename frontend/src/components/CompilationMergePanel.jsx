import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { useTranslation } from 'react-i18next';
import { ScrollingText } from './ScrollingText';
import { Music } from 'lucide-react';
import defaultCover from '../assets/default-cover.svg';

export const CompilationMergePanel = ({ onUpdate, notify }) => {
  const { t } = useTranslation();
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSongs, setSelectedSongs] = useState({}); // album_index -> Set of nd_id

  useEffect(() => {
    fetchCandidates();
  }, []);

  const fetchCandidates = async () => {
    setLoading(true);
    try {
      const data = await api.getCompilationCandidates();
      setCandidates(data);
      // Initialize selection: all songs selected by default
      const initialSelection = {};
      data.forEach((group, idx) => {
        initialSelection[idx] = new Set(group.songs.map(s => s.nd_id));
      });
      setSelectedSongs(initialSelection);
    } catch (e) {
      notify("Failed to fetch candidates: " + e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const toggleSong = (groupIndex, ndId) => {
    const newSelection = { ...selectedSongs };
    const groupSet = new Set(newSelection[groupIndex]);
    if (groupSet.has(ndId)) {
      groupSet.delete(ndId);
    } else {
      groupSet.add(ndId);
    }
    newSelection[groupIndex] = groupSet;
    setSelectedSongs(newSelection);
  };

  const handleMerge = async (groupIndex) => {
    const ids = Array.from(selectedSongs[groupIndex]);
    if (ids.length === 0) {
      notify("Please select at least one song to merge.", "warning");
      return;
    }
    
    try {
      const res = await api.mergeCompilation(ids);
      notify(t('compilation.items_merged', { count: res.merged }));
      if (onUpdate) onUpdate();
      // Remove merged album from list
      setCandidates(prev => prev.filter((_, i) => i !== groupIndex));
    } catch (e) {
      notify("Merge failed: " + e.message, "error");
    }
  };

  const handleDiscard = (groupIndex) => {
    setCandidates(prev => prev.filter((_, i) => i !== groupIndex));
  };

  if (loading) return <div style={{ padding: 20 }}>{t('compilation.loading')}</div>;

  if (candidates.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: 'center', background: 'var(--surface2)', borderRadius: 8 }}>
        <p style={{ color: 'var(--text-dim)' }}>{t('compilation.no_candidates')}</p>
        <button 
          onClick={fetchCandidates} 
          style={{ marginTop: 20, padding: '8px 16px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
        >
          {t('purge.reanalyze')}
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ background: 'var(--surface2)', padding: 20, borderRadius: 8 }}>
        <h3 style={{ margin: 0 }}>{t('compilation.title')}</h3>
        <p style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 8 }}>{t('compilation.desc')}</p>
      </div>

      {candidates.map((group, idx) => (
        <div key={idx} style={{ background: 'var(--surface2)', padding: 20, borderRadius: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 15 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{group.album}</div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>
                {group.artist_count} Artists • {group.songs.length} Tracks
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button 
                onClick={() => handleDiscard(idx)}
                style={{ padding: '8px 16px', background: 'transparent', border: '1px solid #ff4d4d', color: '#ff4d4d', borderRadius: 4, cursor: 'pointer', fontSize: 13 }}
              >
                {t('compilation.discard')}
              </button>
              <button 
                onClick={() => handleMerge(idx)}
                style={{ padding: '8px 16px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}
              >
                {t('compilation.merge_selected')}
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
            {group.songs.map(song => {
              const isSelected = selectedSongs[idx]?.has(song.nd_id);
              const tooManySongs = group.songs.length > 50;
              return (
                <div 
                  key={song.nd_id}
                  onClick={() => toggleSong(idx, song.nd_id)}
                  style={{ 
                    padding: 10, 
                    borderRadius: 6, 
                    background: isSelected ? 'rgba(52, 199, 89, 0.1)' : '#1c1c21',
                    border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    transition: 'all 0.2s',
                    overflow: 'hidden'
                  }}
                >
                  {tooManySongs ? (
                    <div style={{ width: 40, height: 40, borderRadius: 4, background: '#222', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Music size={18} color="var(--text-dim)" />
                    </div>
                  ) : (
                    <img 
                        src={`/api/nd-cover/${song.nd_id}/`} 
                        style={{ width: 40, height: 40, borderRadius: 4, objectFit: 'cover', background: '#333', flexShrink: 0 }}
                        onError={(e) => { e.target.src = defaultCover; }}
                    />
                  )}
                  <div style={{ overflow: 'hidden', flex: 1 }}>
                    <ScrollingText text={song.title} style={{ fontSize: 13, fontWeight: 600 }} />
                    <ScrollingText text={song.artist} style={{ fontSize: 11, color: isSelected ? 'var(--accent)' : 'var(--text-dim)' }} />
                  </div>
                  <div style={{ marginLeft: 'auto', flexShrink: 0 }}>
                    <div style={{ 
                      width: 16, height: 16, borderRadius: '50%', 
                      border: `1px solid ${isSelected ? 'var(--accent)' : '#555'}`,
                      background: isSelected ? 'var(--accent)' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                      {isSelected && <span style={{ color: '#fff', fontSize: 10 }}>✓</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};
