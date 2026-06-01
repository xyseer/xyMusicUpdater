import React, { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api';
import { useTranslation } from 'react-i18next';
import { ScrollingText } from './ScrollingText';
import { Music, ChevronLeft, ChevronRight } from 'lucide-react';
import defaultCover from '../assets/default-cover.svg';

export const CompilationMergePanel = ({ config = {}, onUpdate, notify }) => {
  const { t } = useTranslation();
  const [candidates, setCandidates] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedSongs, setSelectedSongs] = useState({}); // originalIndex -> Set of nd_id
  const [albumArtists, setAlbumArtists] = useState({});   // originalIndex -> string
  const [currentPage, setCurrentPage] = useState(1);
  const [songPages, setSongPages] = useState({});          // originalIndex -> song page number
  const abortControllerRef = useRef(null);

  const configReady = config.DEFAULT_PAGE_SIZE !== undefined;
  const pageSize = parseInt(config.DEFAULT_PAGE_SIZE || 50);

  const fetchCandidates = useCallback(async (page, signal) => {
    setLoading(true);
    try {
      const res = await api.getCompilationCandidates(signal, page, pageSize);
      const results = res.results || [];
      const totalCount = res.total || 0;

      setCandidates(results.map((group, localIdx) => ({
        ...group,
        originalIndex: (page - 1) * pageSize + localIdx,
      })));
      setTotal(totalCount);

      const initialSelection = {};
      const initialSongPages = {};
      const initialAlbumArtists = {};
      results.forEach((group, idx) => {
        const originalIdx = (page - 1) * pageSize + idx;
        initialSelection[originalIdx] = new Set(group.songs.map(s => s.nd_id));
        initialSongPages[originalIdx] = 1;
        initialAlbumArtists[originalIdx] = "Various Artists";
      });
      setSelectedSongs(prev => ({ ...prev, ...initialSelection }));
      setSongPages(prev => ({ ...prev, ...initialSongPages }));
      setAlbumArtists(prev => ({ ...prev, ...initialAlbumArtists }));
    } catch (e) {
      if (e.name !== 'CanceledError') notify("Failed to fetch candidates: " + e.message, "error");
    } finally {
      setLoading(false);
    }
  }, [pageSize, notify]);

  useEffect(() => {
    if (!configReady) return;
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();
    fetchCandidates(currentPage, abortControllerRef.current.signal);
    return () => abortControllerRef.current?.abort();
  }, [currentPage, fetchCandidates, configReady]);

  const toggleSong = (originalIndex, ndId) => {
    setSelectedSongs(prev => {
      const groupSet = new Set(prev[originalIndex]);
      if (groupSet.has(ndId)) groupSet.delete(ndId);
      else groupSet.add(ndId);
      return { ...prev, [originalIndex]: groupSet };
    });
  };

  const setSongPage = (originalIndex, page) => {
    setSongPages(prev => ({ ...prev, [originalIndex]: page }));
  };

  const handleMerge = async (originalIndex) => {
    const ids = Array.from(selectedSongs[originalIndex] || []);
    if (ids.length === 0) {
      notify("Please select at least one song to merge.", "warning");
      return;
    }
    const albumArtist = (albumArtists[originalIndex] || "Various Artists").trim() || "Various Artists";
    try {
      const res = await api.mergeCompilation(ids, albumArtist);
      notify(t('compilation.items_merged', { count: res.merged }));
      fetchCandidates(currentPage);
      if (onUpdate) onUpdate();
    } catch (e) {
      notify("Merge failed: " + e.message, "error");
    }
  };

  const handleDiscard = (originalIndex) => {
    setCandidates(prev => prev.filter(c => c.originalIndex !== originalIndex));
  };

  const totalPages = Math.ceil(total / pageSize);

  if (loading && candidates.length === 0) return <div style={{ padding: 20 }}>{t('compilation.loading')}</div>;

  if (total === 0 && !loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', background: 'var(--surface2)', borderRadius: 8 }}>
        <p style={{ color: 'var(--text-dim)' }}>{t('compilation.no_candidates')}</p>
        <button
          onClick={() => fetchCandidates(1)}
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

      {candidates.map((group) => {
        const songPage = songPages[group.originalIndex] || 1;
        const songTotalPages = Math.ceil(group.songs.length / pageSize);
        const songStart = (songPage - 1) * pageSize;
        const visibleSongs = group.songs.slice(songStart, songStart + pageSize);
        const selectedCount = (selectedSongs[group.originalIndex] || new Set()).size;
        const tooManySongs = group.songs.length > 50;

        return (
          <div key={group.originalIndex} style={{ background: 'var(--surface2)', padding: 20, borderRadius: 8 }}>
            {/* Album header */}
            <div style={{ marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 15 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{group.album}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>
                    {group.artist_count} Artists • {group.songs.length} Tracks • {selectedCount} Selected
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <label style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: 1, textTransform: 'uppercase' }}>
                      {t('compilation.album_artist')}
                    </label>
                    <input
                      value={albumArtists[group.originalIndex] ?? "Various Artists"}
                      onChange={e => setAlbumArtists(prev => ({ ...prev, [group.originalIndex]: e.target.value }))}
                      style={{ padding: '5px 10px', borderRadius: 4, border: '1px solid var(--border)', background: '#1c1c21', color: '#fff', fontSize: 13, width: 180 }}
                    />
                  </div>
                  <button onClick={() => handleDiscard(group.originalIndex)} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid #ff4d4d', color: '#ff4d4d', borderRadius: 4, cursor: 'pointer', fontSize: 13 }}>{t('compilation.discard')}</button>
                  <button onClick={() => handleMerge(group.originalIndex)} style={{ padding: '8px 16px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>{t('compilation.merge_selected')}</button>
                </div>
              </div>
            </div>

            {/* Song grid — only current song page */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
              {visibleSongs.map(song => {
                const isSelected = selectedSongs[group.originalIndex]?.has(song.nd_id);
                return (
                  <div
                    key={song.nd_id}
                    onClick={() => toggleSong(group.originalIndex, song.nd_id)}
                    style={{ padding: 10, borderRadius: 6, background: isSelected ? 'rgba(52, 199, 89, 0.1)' : '#1c1c21', border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, transition: 'all 0.2s', overflow: 'hidden' }}
                  >
                    {tooManySongs && song.nd_id !== visibleSongs[0]?.nd_id ? (
                      <div style={{ width: 40, height: 40, borderRadius: 4, background: '#222', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Music size={18} color="var(--text-dim)" />
                      </div>
                    ) : (
                      <img src={`/api/nd-cover/${song.nd_id}/`} style={{ width: 40, height: 40, borderRadius: 4, objectFit: 'cover', background: '#333', flexShrink: 0 }} loading="lazy" onError={(e) => { e.target.src = defaultCover; }} />
                    )}
                    <div style={{ overflow: 'hidden', flex: 1 }}>
                      <ScrollingText text={song.title} style={{ fontSize: 13, fontWeight: 600 }} />
                      <ScrollingText text={song.artist} style={{ fontSize: 11, color: isSelected ? 'var(--accent)' : 'var(--text-dim)' }} />
                    </div>
                    <div style={{ marginLeft: 'auto', flexShrink: 0 }}>
                      <div style={{ width: 16, height: 16, borderRadius: '50%', border: `1px solid ${isSelected ? 'var(--accent)' : '#555'}`, background: isSelected ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {isSelected && <span style={{ color: '#fff', fontSize: 10 }}>✓</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Per-album song pagination */}
            {songTotalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                <button
                  disabled={songPage === 1}
                  onClick={() => setSongPage(group.originalIndex, songPage - 1)}
                  style={{ background: 'transparent', border: 'none', color: songPage === 1 ? '#444' : 'var(--accent)', cursor: songPage === 1 ? 'default' : 'pointer', padding: 4 }}
                >
                  <ChevronLeft size={18} />
                </button>
                <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                  Songs {songStart + 1}–{Math.min(songStart + pageSize, group.songs.length)} / {group.songs.length}
                </span>
                <button
                  disabled={songPage === songTotalPages}
                  onClick={() => setSongPage(group.originalIndex, songPage + 1)}
                  style={{ background: 'transparent', border: 'none', color: songPage === songTotalPages ? '#444' : 'var(--accent)', cursor: songPage === songTotalPages ? 'default' : 'pointer', padding: 4 }}
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            )}
          </div>
        );
      })}

      {/* Album-level pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20, marginTop: 20, padding: '10px', background: 'rgba(255,255,255,0.02)', borderRadius: 8 }}>
          <button disabled={currentPage === 1} onClick={() => setCurrentPage(prev => prev - 1)} style={{ background: 'transparent', border: 'none', color: currentPage === 1 ? '#444' : 'var(--accent)', cursor: 'pointer' }}><ChevronLeft size={24} /></button>
          <span style={{ fontSize: 14, fontWeight: 700 }}>{currentPage} / {totalPages}</span>
          <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(prev => prev + 1)} style={{ background: 'transparent', border: 'none', color: currentPage === totalPages ? '#444' : 'var(--accent)', cursor: 'pointer' }}><ChevronRight size={24} /></button>
        </div>
      )}
    </div>
  );
};
