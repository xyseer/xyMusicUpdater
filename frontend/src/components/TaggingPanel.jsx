import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { api } from '../api';
import { useTranslation } from 'react-i18next';
import { ScrollingText } from './ScrollingText';
import { ChevronLeft, ChevronRight, Wand2, RotateCcw } from 'lucide-react';
import axios from 'axios';

// Strip YouTube/video-platform cruft from a song title before searching
const cleanQuery = (s) => {
  if (!s) return '';
  s = s.replace(/[【】｛｝].*?[【】｛｝]/g, ' ').replace(/[「」]/g, ' ');
  const videoWords = /(official\s*(mv|video|audio|music\s*video|lyric)?|music\s*video|\bmv\b|\bpv\b|full\s*(ver\.?|version|size)?|lyrics?\s*(ver\.?)?|\bhd\b|\b4k\b|\bvideo\b|music\s*clip)/gi;
  s = s.replace(/[\(\[（]?videoWords[\)\]）]?/g, ' ').replace(videoWords, ' ');
  s = s.replace(/\s*(feat\.?|ft\.?)\s+[^\-\(（【\[]+/gi, ' ');
  s = s.replace(/[\(（][^)）]{0,40}[\)）]/g, ' ');
  // Strip "Artist - Title" prefix if title side is longer
  const parts = s.split(/\s[-–—]\s/);
  if (parts.length === 2 && parts[1].trim().length >= parts[0].trim().length) s = parts[1];
  return s.replace(/\s+/g, ' ').trim();
};

// Multi-signal similarity: containment check + bigram Dice coefficient + word overlap
const scoreTitleMatch = (query, candidateTitle) => {
  const cq = cleanQuery(query).toLowerCase();
  const ct = (candidateTitle || '').toLowerCase().trim();
  if (!cq || !ct) return 0.0;
  if (cq === ct) return 1.0;
  if (ct.includes(cq) || cq.includes(ct)) return 0.92;
  // Bigram Dice
  const bigrams = s => {
    const m = new Map();
    for (let i = 0; i < s.length - 1; i++) {
      const b = s[i] + s[i + 1];
      m.set(b, (m.get(b) || 0) + 1);
    }
    return m;
  };
  const b1 = bigrams(cq), b2 = bigrams(ct);
  let common = 0;
  for (const [bg, cnt] of b1) common += Math.min(cnt, b2.get(bg) || 0);
  const diceScore = cq.length > 1 && ct.length > 1 ? (2 * common) / (cq.length + ct.length - 2) : 0;
  // Word overlap
  const qw = new Set(cq.split(/\s+/).filter(Boolean));
  const tw = new Set(ct.split(/\s+/).filter(Boolean));
  let sharedWords = 0;
  for (const w of qw) if (tw.has(w)) sharedWords++;
  const overlapScore = qw.size && tw.size ? (sharedWords / Math.max(qw.size, tw.size)) * 0.88 : 0;
  return Math.max(diceScore, overlapScore);
};

// Keep strSimilarity as alias for backward compat
const strSimilarity = scoreTitleMatch;

const inputStyle = { padding: '6px 10px', borderRadius: 4, border: '1px solid var(--border)', background: '#0a0a0c', color: '#fff' };
const editBtnStyle = { padding: '4px 12px', borderRadius: 4, border: '1px solid var(--accent)', background: 'transparent', color: 'var(--accent)', cursor: 'pointer' };
const saveBtnStyle = { padding: '6px 12px', borderRadius: 4, border: 'none', background: 'var(--green)', color: '#fff', cursor: 'pointer' };
const dropzoneStyle = { padding: '12px', borderRadius: 4, border: '1px dashed var(--border)', cursor: 'pointer', display: 'flex', alignItems: 'center' };

export const TaggingPanel = ({ config = {}, playlistMap = {}, onUpdate, notify }) => {
  const { t } = useTranslation();
  const [songs, setSongs] = useState([]);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isAutoTagging, setIsAutoTagging] = useState(false);
  const [autoTagProgress, setAutoTagProgress] = useState({ current: 0, total: 0 });
  const fileInputRef = useRef(null);
  const abortControllerRef = useRef(null);
  const autoTagCancelRef = useRef(false);

  const configReady = config.DEFAULT_PAGE_SIZE !== undefined;
  const pageSize = parseInt(config.DEFAULT_PAGE_SIZE || 50);

  const fetchPage = useCallback(async (page, signal) => {
    setIsLoading(true);
    try {
      const res = await api.getSongs(signal, 'pending', page, pageSize);
      setSongs(res.results || []);
      setTotal(res.total || 0);
      return res.results || [];
    } catch (e) {
      if (e.name !== 'CanceledError') console.error('Failed to fetch tagging songs', e);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [pageSize]);

  // Remove a song from local state; re-fetch only when the page becomes empty
  const dropSong = useCallback((id) => {
    setSongs(prev => {
      const next = prev.filter(s => s.id !== id);
      if (next.length === 0) setTimeout(() => fetchPage(currentPage), 0);
      return next;
    });
    setTotal(prev => Math.max(0, prev - 1));
    if (onUpdate) onUpdate();
  }, [currentPage, fetchPage, onUpdate]);

  // Update a song in-place (e.g. after reject)
  const patchSong = useCallback((id, updates) => {
    setSongs(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  }, []);

  useEffect(() => {
    if (!configReady) return;
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();
    fetchPage(currentPage, abortControllerRef.current.signal);
    return () => abortControllerRef.current?.abort();
  }, [currentPage, fetchPage, configReady]);

  const handleAutoTagAll = useCallback(async () => {
    // Toggle cancel if already running
    if (isAutoTagging) { autoTagCancelRef.current = true; return; }

    autoTagCancelRef.current = false;
    setIsAutoTagging(true);
    setAutoTagProgress({ current: 0, total: 0 });

    try {
      // Load ALL songs needing tagging across every page (not just current view)
      let allSongs = [];
      let page = 1;
      const BATCH = 100;
      while (true) {
        const res = await api.getSongs(null, 'pending', page, BATCH);
        const raw = (res.results || []).filter(s => s.needs_tagging && !s.pending_confirmation);
        allSongs.push(...raw);
        if ((res.results || []).length < BATCH || allSongs.length >= (res.total || 0) || page >= 100) break;
        page++;
      }

      if (allSongs.length === 0) { notify("No songs need auto-tagging"); return; }
      notify(`Auto-tagging ${allSongs.length} songs from browser…`);
      setAutoTagProgress({ current: 0, total: allSongs.length });

      let tagged = 0;

      for (let i = 0; i < allSongs.length; i++) {
        if (autoTagCancelRef.current) break;
        const song = allSongs[i];
        setAutoTagProgress({ current: i + 1, total: allSongs.length });

        const rawQuery = song.title || song.filename.replace(/\.[^.]+$/, '');
        const query = cleanQuery(rawQuery) || rawQuery;
        let bestMatch = null, bestScore = 0;

        // 1. iTunes (no strict rate limit, fast)
        try {
          const r = await axios.get('https://itunes.apple.com/search', {
            params: { term: query, entity: 'song', limit: 3 }, timeout: 8000
          });
          for (const item of (r.data?.results || [])) {
            const score = scoreTitleMatch(rawQuery, item.trackName || '');
            if (score > bestScore) {
              bestScore = score;
              bestMatch = {
                title: item.trackName || '',
                artist: item.artistName || '',
                album: item.collectionName || item.trackName || '',
                album_artist: item.artistName || '',
              };
            }
          }
        } catch (_) {}

        // 2. MusicBrainz fallback (requires 1s between calls per their ToS)
        if (bestScore < 0.65) {
          await new Promise(r => setTimeout(r, 1100));
          try {
            const r = await axios.get('https://musicbrainz.org/ws/2/recording', {
              params: { query, limit: 3, fmt: 'json' }, timeout: 8000
            });
            for (const rec of (r.data?.recordings || [])) {
              const score = scoreTitleMatch(rawQuery, rec.title || '');
              if (score > bestScore) {
                const rel = rec.releases?.[0];
                bestScore = score;
                bestMatch = {
                  title: rec.title || '',
                  artist: rec['artist-credit']?.[0]?.name || '',
                  album: rel?.title || rec.title || '',
                  album_artist: rel?.['artist-credit']?.[0]?.name || rec['artist-credit']?.[0]?.name || '',
                };
              }
            }
          } catch (_) {}
        }

        // Stage in DB only (no file write) if confidence ≥ 0.65
        if (bestMatch && bestScore >= 0.65) {
          try {
            await api.stageSong(song.id, {
              title: bestMatch.title,
              artist: bestMatch.artist,
              album: bestMatch.album || bestMatch.title,
              album_artist: bestMatch.album_artist || bestMatch.artist,
              needs_tagging: false,
              pending_confirmation: true,
            });
            tagged++;
          } catch (_) {}
        }

        await new Promise(r => setTimeout(r, 200));
      }

      const cancelled = autoTagCancelRef.current;
      notify(cancelled
        ? `Cancelled — ${tagged} songs staged for confirmation`
        : `Done — ${tagged} / ${allSongs.length} songs staged for confirmation`
      );
      fetchPage(currentPage);
      if (onUpdate) onUpdate();

    } catch (e) {
      notify('Auto-tagging error: ' + e.message, 'error');
    } finally {
      setIsAutoTagging(false);
      setAutoTagProgress({ current: 0, total: 0 });
      autoTagCancelRef.current = false;
    }
  }, [isAutoTagging, fetchPage, currentPage, onUpdate, notify]);


  const startEdit = (song) => {
    setEditingId(song.id);
    setFormData({ 
      title: song.title || '', 
      artist: song.artist || '', 
      album: song.album || '',
      album_artist: song.album_artist || '',
      cover_url: ''
    });
    setSearchQuery(song.title || '');
    setSearchResults([]);
  };

  const save = async (id) => {
    try {
      const payload = { ...formData, needs_tagging: false, pending_confirmation: false };
      if (!payload.album_artist) payload.album_artist = payload.artist;
      await api.updateSong(id, payload);
      setEditingId(null);
      notify("Tags saved successfully!");
      dropSong(id);
    } catch (e) {
      notify("Failed to save tags: " + (e.response?.data?.error || e.message), "error");
    }
  };

  const handleConfirm = async (id) => {
    try {
      await api.confirmTags([id]);
      notify("Tags confirmed!");
      dropSong(id);
    } catch (e) { notify("Failed", "error"); }
  };

  const handleReject = async (id) => {
    try {
      await api.rejectTags([id]);
      notify("Rejected — marked for re-tagging");
      patchSong(id, { pending_confirmation: false, needs_tagging: true });
      if (onUpdate) onUpdate();
    } catch (e) { notify("Failed", "error"); }
  };

  const handleRevert = async (id) => {
    try {
      await api.revertSong(id);
      notify("Restored!");
      setEditingId(null);
      dropSong(id);
    } catch (e) { notify("Failed", "error"); }
  };

  // ── MANUAL FRONTEND SEARCH ────────────────────────────────────────

  const performSearch = async () => {
    if (!searchQuery) return;
    setIsSearching(true);
    setSearchResults([]);
    let allResults = [];
    // iTunes (direct from browser to avoid backend transfer)
    try {
      const itunesResp = await axios.get("https://itunes.apple.com/search", { params: { term: searchQuery, entity: "song", limit: 5 }, timeout: 8000 });
      const itunesItems = itunesResp.data?.results || [];
      allResults.push(...itunesItems.map(i => ({
        source: "itunes",
        title: i.trackName || "",
        artist: i.artistName || "",
        album: i.collectionName || "",
        album_artist: i.artistName || "",
        cover_url: (i.artworkUrl100 || "").replace("100x100bb.jpg", "600x600bb.jpg")
      })));
    } catch (e) {}
    // MusicBrainz (direct from browser)
    try {
      const mbResp = await axios.get("https://musicbrainz.org/ws/2/recording", { params: { query: searchQuery, limit: 5, fmt: "json" }, timeout: 8000 });
      const recordings = mbResp.data?.recordings || [];
      allResults.push(...recordings.map(rec => {
        const release = rec.releases?.[0];
        return {
          source: "musicbrainz",
          title: rec.title || "",
          artist: rec['artist-credit']?.[0]?.name || "",
          album: release?.title || "",
          album_artist: release?.['artist-credit']?.[0]?.name || "",
          cover_url: release?.id ? `https://coverartarchive.org/release/${release.id}/front-500` : ""
        };
      }));
    } catch (e) {}
    setSearchResults(allResults);
    if (allResults.length === 0 && notify) notify("No metadata results found", "warning");
    setIsSearching(false);
  };

  const applyResult = (res) => {
    setFormData(prev => ({ ...prev, title: res.title || '', artist: res.artist || '', album: res.album || '', album_artist: res.album_artist || res.artist || '', ...(res.cover_url ? { cover_url: res.cover_url } : {}) }));
  };

  const handleImageFile = (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => setFormData(prev => ({ ...prev, cover_url: e.target.result }));
    reader.readAsDataURL(file);
  };

  const handleDelete = async (id) => {
    if (window.confirm("Delete file?")) {
      try {
        await api.deleteSong(id);
        notify("Deleted");
        dropSong(id);
      } catch (e) { notify("Failed: " + e.message, "error"); }
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div style={{ background: 'var(--surface2)', padding: 16, borderRadius: 8 }}>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>{t('tagging.title')} ({total})</div>
          <div style={{ display: 'flex', gap: 10 }}>
            {songs.some(s => s.pending_confirmation) && (
                <button onClick={() => { const ids = songs.filter(s => s.pending_confirmation).map(s => s.id); api.confirmTags(ids).then(() => { notify("Confirmed!"); ids.forEach(id => dropSong(id)); }); }} style={{...saveBtnStyle, background: 'var(--accent)'}}>{t('tagging.confirm_all')}</button>
            )}
            <button onClick={handleAutoTagAll} style={isAutoTagging ? {...saveBtnStyle, background: '#c0392b'} : saveBtnStyle}>
                <Wand2 size={14} style={{ marginRight: 6 }} />
                {isAutoTagging
                  ? `Cancel (${autoTagProgress.current}/${autoTagProgress.total})`
                  : t('tagging.auto_tag_all')}
            </button>
          </div>
      </div>

      {isLoading ? <div style={{ padding: 40, textAlign: 'center', color: 'var(--accent)' }}>Loading...</div> : (
        <>
            {songs.map(s => {
                const pls = playlistMap[s.filename.toLowerCase()] || [];
                return (
                <div key={s.id} style={{ 
                    marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid #333',
                    background: (pls.length > 0) ? 'rgba(155,81,224,0.05)' : (s.pending_confirmation ? 'rgba(76,175,80,0.05)' : 'transparent'),
                    padding: (pls.length > 0 || s.pending_confirmation) ? '10px' : '0px', borderRadius: 4
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 16 }}>
                    <div style={{ fontWeight: 600, overflow: 'hidden', flex: 1 }}>
                        <ScrollingText text={s.filename} />
                        {s.pending_confirmation && <span style={{ display: 'inline-block', marginTop: 4, fontSize: 10, color: 'var(--green)', border: '1px solid var(--green)', padding: '2px 4px', borderRadius: 4 }}>{t('tagging.draft_ready')}</span>}
                    </div>
                    {pls.length > 0 && <div style={{ background: 'var(--accent)', color: '#fff', fontSize: 10, padding: '2px 8px', borderRadius: 4, fontWeight: 800 }}>{t('tagging.protected_in')} {pls.join(', ')}</div>}
                    </div>
                    
                    {(editingId === s.id || s.pending_confirmation) ? (
                    <div style={{ display: 'flex', gap: 20 }}>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div>
                            <input value={editingId === s.id ? formData.title : s.title} onChange={e => setFormData({...formData, title: e.target.value})} placeholder={t('tagging.title')} style={{...inputStyle, width: '100%'}} disabled={editingId !== s.id} />
                            {s.pending_confirmation && s.original_tags?.title && <div style={{ fontSize: 10, color: '#ff9800', marginTop: 4 }}>{t('tagging.original')} {s.original_tags.title}</div>}
                        </div>
                        <div>
                            <input value={editingId === s.id ? formData.artist : s.artist} onChange={e => setFormData({...formData, artist: e.target.value})} placeholder={t('tagging.artist')} style={{...inputStyle, width: '100%'}} disabled={editingId !== s.id} />
                            {s.pending_confirmation && s.original_tags?.artist && <div style={{ fontSize: 10, color: '#ff9800', marginTop: 4 }}>{t('tagging.original')} {s.original_tags.artist}</div>}
                        </div>
                        <div>
                            <input value={editingId === s.id ? formData.album : s.album} onChange={e => setFormData({...formData, album: e.target.value})} placeholder={t('tagging.album')} style={{...inputStyle, width: '100%'}} disabled={editingId !== s.id} />
                            {s.pending_confirmation && s.original_tags?.album && <div style={{ fontSize: 10, color: '#ff9800', marginTop: 4 }}>{t('tagging.original')} {s.original_tags.album}</div>}
                        </div>
                        <div>
                            <input value={editingId === s.id ? formData.album_artist : s.album_artist} onChange={e => setFormData({...formData, album_artist: e.target.value})} placeholder={t('tagging.album_artist')} style={{...inputStyle, width: '100%'}} disabled={editingId !== s.id} />
                            {s.pending_confirmation && s.original_tags?.album_artist && <div style={{ fontSize: 10, color: '#ff9800', marginTop: 4 }}>{t('tagging.original')} {s.original_tags.album_artist}</div>}
                        </div>

                        <div style={{ display: 'flex', gap: 16 }}>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 4 }}>CURRENT COVER</div>
                                <div style={{ width: 100, height: 100, background: 'var(--surface)', borderRadius: 4, overflow: 'hidden' }}>
                                    <img
                                        src={`/api/songs/${s.id}/cover/?t=${s.updated_at}`}
                                        draggable={editingId === s.id}
                                        onDragStart={e => e.dataTransfer.setData('text/plain', 'use-current-cover')}
                                        style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: editingId === s.id ? 'grab' : 'default' }}
                                        loading="lazy"
                                    />
                                </div>
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 4 }}>NEW COVER</div>
                                <div
                                    onDrop={e => {
                                        e.preventDefault();
                                        setIsDragging(false);
                                        if (!editingId || editingId !== s.id) return;
                                        if (e.dataTransfer.getData('text/plain') === 'use-current-cover') {
                                            // Drag from current cover → clear new cover selection
                                            setFormData(prev => ({ ...prev, cover_url: '' }));
                                        } else if (e.dataTransfer.files[0]) {
                                            handleImageFile(e.dataTransfer.files[0]);
                                        }
                                    }}
                                    onDragOver={e => { e.preventDefault(); if (editingId === s.id) setIsDragging(true); }}
                                    onDragLeave={() => setIsDragging(false)}
                                    onClick={() => editingId === s.id && fileInputRef.current.click()}
                                    style={{ width: 100, height: 100, border: `1px dashed ${isDragging && editingId === s.id ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 4, background: isDragging && editingId === s.id ? 'rgba(155,81,224,0.08)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: editingId === s.id ? 'pointer' : 'default', overflow: 'hidden' }}>
                                    {editingId === s.id
                                        ? <img
                                            src={formData.cover_url || `/api/songs/${s.id}/cover/?t=${s.updated_at}`}
                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                          />
                                        : <span style={{ fontSize: 10, color: 'var(--text-dim)', textAlign: 'center', padding: 4 }}>—</span>
                                    }
                                    <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={e => handleImageFile(e.target.files[0])} />
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                            {editingId === s.id ? (
                                <button onClick={() => save(s.id)} style={{...saveBtnStyle, flex: 1}}>{t('tagging.save_tags')}</button>
                            ) : (
                                <button onClick={() => handleConfirm(s.id)} style={{...saveBtnStyle, flex: 1, background: 'var(--accent)'}}>{t('tagging.confirm_draft')}</button>
                            )}
                            <button onClick={() => editingId === s.id ? setEditingId(null) : startEdit(s)} style={editBtnStyle}>{editingId === s.id ? t('tagging.cancel') : t('tagging.edit_draft')}</button>
                            <button onClick={() => handleRevert(s.id)} style={{ ...editBtnStyle, color: '#ff9800', borderColor: '#ff9800' }}><RotateCcw size={14} style={{marginRight: 4}}/> {t('tagging.use_original')}</button>
                            <button onClick={() => handleReject(s.id)} style={{ ...editBtnStyle, color: '#ff4d4d', borderColor: '#ff4d4d' }}>{t('tagging.reject')}</button>
                        </div>
                        </div>

                        {editingId === s.id && (
                        <div style={{ flex: 1, borderLeft: '1px solid #333', paddingLeft: 20 }}>
                            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && performSearch()} placeholder={t('tagging.search')} style={{ ...inputStyle, flex: 1 }} />
                            <button onClick={performSearch} disabled={isSearching} style={saveBtnStyle}>{isSearching ? '...' : t('tagging.search')}</button>
                            </div>
                            {searchResults.map((res, i) => (
                            <div key={i} style={{ display: 'flex', gap: 12, padding: 8, background: 'var(--surface)', borderRadius: 4, cursor: 'pointer', marginBottom: 4 }} onClick={() => applyResult(res)}>
                                {res.cover_url && <img src={res.cover_url} alt="cover" style={{ width: 30, height: 30, borderRadius: 4 }} />}
                                <div style={{ flex: 1, fontSize: 11 }}>
                                <div style={{ fontWeight: 600 }}>{res.title}</div>
                                <div style={{ color: 'var(--text-dim)' }}>{res.artist}</div>
                                </div>
                            </div>
                            ))}
                        </div>
                        )}
                    </div>
                    ) : (
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => startEdit(s)} style={editBtnStyle}>{t('tagging.edit_metadata')}</button>
                        <button onClick={() => handleDelete(s.id)} style={{ ...editBtnStyle, color: '#ff4d4d', borderColor: '#ff4d4d' }}>{t('tagging.delete')}</button>
                    </div>
                    )}
                </div>
                );
            })}

            {totalPages > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20, marginTop: 20, padding: '10px', background: 'rgba(255,255,255,0.02)', borderRadius: 8 }}>
                    <button disabled={currentPage === 1} onClick={() => setCurrentPage(prev => prev - 1)} style={{ background: 'transparent', border: 'none', color: currentPage === 1 ? '#444' : 'var(--accent)', cursor: 'pointer' }}><ChevronLeft size={24} /></button>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>{currentPage} / {totalPages}</span>
                    <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(prev => prev + 1)} style={{ background: 'transparent', border: 'none', color: currentPage === totalPages ? '#444' : 'var(--accent)', cursor: 'pointer' }}><ChevronRight size={24} /></button>
                </div>
            )}
        </>
      )}
    </div>
  );
};
