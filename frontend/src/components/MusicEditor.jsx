import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { api } from '../api';
import { useTranslation } from 'react-i18next';
import { Play, Pause, Scissors, Search, Music, Clock, Check, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { ScrollingText } from './ScrollingText';
import defaultCover from '../assets/default-cover.svg';

// ── Deterministic fake waveform ──────────────────────────────────────────────
const useWaveform = (duration, barCount = 120) =>
  useMemo(() => {
    if (!duration) return [];
    return Array.from({ length: barCount }, (_, i) => {
      const s = i * 131.7 + duration * 19.3;
      return 0.12 + 0.88 * Math.abs(Math.sin(s) * Math.cos(s * 0.61 + 1.4));
    });
  }, [duration, barCount]);

const fmt = (t) => {
  if (!isFinite(t) || t < 0) return '0:00.0';
  const m = Math.floor(t / 60);
  const s = (t % 60).toFixed(1);
  return `${m}:${s.padStart(4, '0')}`;
};

const HANDLE_HIT_PX = 14;

export const MusicEditor = ({ config = {}, notify, onUpdate, initialSong = null }) => {
  const { t } = useTranslation();
  const [songs, setSongs] = useState([]);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedSong, setSelectedSong] = useState(null);
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [previewInfo, setPreviewInfo] = useState(null);
  const [dragging, setDragging] = useState(null); // 'start' | 'end' | 'seek'

  const audioRef = useRef(null);
  const timelineRef = useRef(null);
  const abortControllerRef = useRef(null);

  const configReady = config.DEFAULT_PAGE_SIZE !== undefined;
  const pageSize = parseInt(config.DEFAULT_PAGE_SIZE || 50);

  const fetchPage = useCallback(async (page, signal) => {
    setIsLoading(true);
    try {
      const res = await api.getSongs(signal, 'pending', page, pageSize);
      setSongs(res.results || []);
      setTotal(res.total || 0);
    } catch (e) {
      if (e.name !== 'CanceledError') console.error('Failed to fetch editor songs', e);
    } finally {
      setIsLoading(false);
    }
  }, [pageSize]);

  useEffect(() => {
    if (!configReady) return;
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();
    fetchPage(currentPage, abortControllerRef.current.signal);
    return () => abortControllerRef.current?.abort();
  }, [currentPage, fetchPage, configReady]);

  const cleanupOldPreview = async (path) => {
    if (path) try { await api.cleanupPreviews(path); } catch (e) {}
  };

  const handleSelectSong = (song) => {
    if (previewInfo) cleanupOldPreview(previewInfo.path);
    setSelectedSong(song);
    setPreviewInfo(null);
    setStartTime(0);
    setEndTime(0);
    setCurrentTime(0);
    setDragging(null);
  };

  useEffect(() => {
    return () => { if (previewInfo) cleanupOldPreview(previewInfo.path); };
  }, [previewInfo]);

  useEffect(() => {
    if (selectedSong && audioRef.current) audioRef.current.load();
  }, [selectedSong, previewInfo]);

  // Select an externally chosen song (e.g. from library Trim button)
  useEffect(() => {
    if (!initialSong) return;
    setSelectedSong(initialSong);
    setPreviewInfo(null);
    setStartTime(0);
    setEndTime(0);
    setCurrentTime(0);
    setDragging(null);
  }, [initialSong?.id]);

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      const dur = audioRef.current.duration;
      setDuration(dur);
      if (!previewInfo) setEndTime(dur);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
  };

  // ── Timeline interaction ───────────────────────────────────────────────────
  const getTimeFromX = (clientX) => {
    if (!timelineRef.current || !duration) return 0;
    const rect = timelineRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    return (x / rect.width) * duration;
  };

  const handleTimelineMouseDown = (e) => {
    if (!duration) return;
    e.preventDefault();
    const rect = timelineRef.current.getBoundingClientRect();
    const xPx = e.clientX - rect.left;
    const startPx = (startTime / duration) * rect.width;
    const endPx = (endTime / duration) * rect.width;

    if (!previewInfo && Math.abs(xPx - startPx) <= HANDLE_HIT_PX) {
      setDragging('start');
    } else if (!previewInfo && Math.abs(xPx - endPx) <= HANDLE_HIT_PX) {
      setDragging('end');
    } else {
      const time = getTimeFromX(e.clientX);
      setCurrentTime(time);
      if (audioRef.current) audioRef.current.currentTime = time;
      setDragging('seek');
    }
  };

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e) => {
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const time = getTimeFromX(clientX);
      if (dragging === 'start') setStartTime(Math.max(0, Math.min(time, endTime - 0.5)));
      else if (dragging === 'end') setEndTime(Math.min(duration, Math.max(time, startTime + 0.5)));
      else { setCurrentTime(time); if (audioRef.current) audioRef.current.currentTime = time; }
    };
    const onUp = () => setDragging(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
  }, [dragging, startTime, endTime, duration]);

  // ── Audio actions ──────────────────────────────────────────────────────────
  const handleGeneratePreview = async () => {
    if (!selectedSong) return;
    if (startTime >= endTime) { notify("Start must be before end", "error"); return; }
    if (previewInfo) await cleanupOldPreview(previewInfo.path);
    setIsProcessing(true);
    try {
      const res = await api.trimSong(selectedSong.id, startTime.toFixed(1), endTime.toFixed(1));
      setPreviewInfo({ path: res.preview_path, url: res.stream_url });
      notify("Preview generated!");
    } catch (e) { notify(t('editor.error'), "error"); }
    finally { setIsProcessing(false); }
  };

  const handleConfirmTrim = async () => {
    if (!selectedSong || !previewInfo) return;
    setIsProcessing(true);
    try {
      await api.confirmTrim(selectedSong.id, previewInfo.path);
      notify(t('editor.success'));
      setSelectedSong(null);
      setPreviewInfo(null);
      fetchPage(currentPage);
      if (onUpdate) onUpdate();
    } catch (e) { notify("Failed", "error"); }
    finally { setIsProcessing(false); }
  };

  const waveformBars = useWaveform(duration);
  const filteredSongs = songs.filter(s =>
    (s.title || s.filename).toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.artist || '').toLowerCase().includes(searchTerm.toLowerCase())
  );
  const totalPages = Math.ceil(total / pageSize);

  const startPct = duration ? (startTime / duration) * 100 : 0;
  const endPct = duration ? (endTime / duration) * 100 : 100;
  const playPct = duration ? (currentTime / duration) * 100 : 0;
  const keepDuration = endTime - startTime;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ background: 'var(--surface2)', padding: 20, borderRadius: 8 }}>
        <h3 style={{ margin: 0 }}>{t('editor.title')}</h3>
        <p style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 8 }}>{t('editor.desc')}</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: window.innerWidth > 1024 ? '320px 1fr' : '1fr', gap: 24, height: '70vh', minHeight: 600 }}>

        {/* ── Song list ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, background: 'var(--surface)', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
          <div style={{ padding: 12, borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center' }}>
            <Search size={14} color="var(--text-dim)" />
            <input type="text" placeholder={t('tagging.search')} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: 13, width: '100%', outline: 'none' }} />
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
            {isLoading && <div style={{ padding: 20, textAlign: 'center', color: 'var(--accent)' }}>Loading...</div>}
            {!isLoading && filteredSongs.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-dim)', fontSize: 12 }}>No songs found.</div>}
            {!isLoading && filteredSongs.map(song => (
              <div key={song.id} onClick={() => handleSelectSong(song)} style={{ padding: '10px 12px', borderRadius: 6, cursor: 'pointer', background: selectedSong?.id === song.id ? 'var(--surface2)' : 'transparent', border: `1px solid ${selectedSong?.id === song.id ? 'var(--accent)' : 'transparent'}`, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 12 }}>
                <img src={`/api/songs/${song.id}/cover/`} style={{ width: 36, height: 36, borderRadius: 4, objectFit: 'cover', background: '#333', flexShrink: 0 }} loading="lazy" onError={e => { e.target.src = defaultCover; }} />
                <div style={{ overflow: 'hidden', flex: 1 }}>
                  <ScrollingText text={song.title || song.filename} style={{ fontSize: 13, fontWeight: 600 }} />
                  <ScrollingText text={song.artist || 'Unknown Artist'} style={{ fontSize: 11, color: 'var(--text-dim)' }} />
                </div>
              </div>
            ))}
          </div>
          {totalPages > 1 && (
            <div style={{ padding: 10, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'center', gap: 10 }}>
              <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} style={{ background: 'transparent', border: 'none', color: '#fff' }}><ChevronLeft size={16} /></button>
              <span style={{ fontSize: 11 }}>{currentPage} / {totalPages}</span>
              <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)} style={{ background: 'transparent', border: 'none', color: '#fff' }}><ChevronRight size={16} /></button>
            </div>
          )}
        </div>

        {/* ── Editor panel ── */}
        <div style={{ background: 'var(--surface)', borderRadius: 8, padding: 32, display: 'flex', flexDirection: 'column', border: '1px solid var(--border)', minWidth: 0 }}>
          {selectedSong ? (
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 28, flex: 1 }}>

              {/* Song info */}
              <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <img src={`/api/songs/${selectedSong.id}/cover/`} style={{ width: 100, height: 100, borderRadius: 8, objectFit: 'cover', background: '#333', boxShadow: '0 8px 24px rgba(0,0,0,0.5)', opacity: previewInfo ? 0.5 : 1 }} onError={e => { e.target.src = defaultCover; }} />
                  {previewInfo && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.55)', borderRadius: 8 }}><span style={{ color: 'var(--accent)', fontSize: 10, fontWeight: 900, letterSpacing: 1 }}>PREVIEW</span></div>}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <h2 style={{ margin: 0, fontSize: 20 }}>{selectedSong.title || selectedSong.filename}</h2>
                  <div style={{ color: 'var(--text-dim)', marginTop: 6, fontSize: 14 }}>{selectedSong.artist || 'Unknown Artist'}</div>
                  <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: 4 }}><Clock size={12} /> Total: <b style={{ color: '#fff' }}>{fmt(duration)}</b></span>
                    {!previewInfo && duration > 0 && (
                      <span style={{ fontSize: 11, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Scissors size={12} /> Keep: <b>{fmt(keepDuration)}</b> ({Math.round((keepDuration / duration) * 100)}%)
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* ── Modern Trim Timeline ── */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>

                {/* Time ruler */}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-dim)', padding: '0 2px' }}>
                  {duration > 0 && Array.from({ length: 7 }, (_, i) => (
                    <span key={i}>{fmt((i / 6) * duration)}</span>
                  ))}
                </div>

                {/* Main timeline */}
                <div
                  ref={timelineRef}
                  onMouseDown={handleTimelineMouseDown}
                  onTouchStart={e => handleTimelineMouseDown({ clientX: e.touches[0].clientX, preventDefault: () => e.preventDefault() })}
                  style={{
                    position: 'relative',
                    height: 100,
                    background: '#0a0a0e',
                    borderRadius: 10,
                    border: '1px solid var(--border)',
                    overflow: 'hidden',
                    cursor: dragging === 'start' || dragging === 'end' ? 'ew-resize' : 'crosshair',
                    userSelect: 'none',
                    WebkitUserSelect: 'none',
                  }}
                >
                  {/* Waveform bars */}
                  <div style={{ position: 'absolute', inset: '8px 2px', display: 'flex', alignItems: 'center', gap: 1 }}>
                    {waveformBars.map((h, i) => {
                      const barPct = (i / waveformBars.length) * 100;
                      const inKeep = !previewInfo && barPct >= startPct && barPct <= endPct;
                      return (
                        <div key={i} style={{
                          flex: 1,
                          height: `${h * 100}%`,
                          background: inKeep ? 'var(--accent)' : 'rgba(255,255,255,0.18)',
                          borderRadius: 1,
                          opacity: inKeep ? 0.9 : 0.35,
                          transition: 'background 0.05s, opacity 0.05s',
                        }} />
                      );
                    })}
                  </div>

                  {/* Cut-left overlay */}
                  {!previewInfo && (
                    <div style={{ position: 'absolute', inset: 0, left: 0, width: `${startPct}%`, background: 'rgba(0,0,0,0.72)', zIndex: 3 }} />
                  )}
                  {/* Cut-right overlay */}
                  {!previewInfo && (
                    <div style={{ position: 'absolute', inset: 0, left: `${endPct}%`, right: 0, background: 'rgba(0,0,0,0.72)', zIndex: 3 }} />
                  )}

                  {/* Keep-zone border lines (top + bottom) */}
                  {!previewInfo && duration > 0 && (
                    <div style={{
                      position: 'absolute', top: 0, bottom: 0,
                      left: `${startPct}%`, width: `${endPct - startPct}%`,
                      borderTop: '2px solid rgba(155,81,224,0.6)',
                      borderBottom: '2px solid rgba(155,81,224,0.6)',
                      zIndex: 4, pointerEvents: 'none',
                    }} />
                  )}

                  {/* ── Start handle ── */}
                  {!previewInfo && duration > 0 && (
                    <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${startPct}%`, zIndex: 6, transform: 'translateX(-50%)' }}>
                      {/* Vertical line */}
                      <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: 3, background: '#fbbf24', transform: 'translateX(-50%)', borderRadius: 2 }} />
                      {/* Top grip tab */}
                      <div style={{
                        position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
                        width: 22, height: 20, background: '#fbbf24', borderRadius: '0 0 6px 6px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'ew-resize', boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
                      }}>
                        <span style={{ color: '#000', fontSize: 9, fontWeight: 900, lineHeight: 1 }}>◀</span>
                      </div>
                      {/* Bottom time label */}
                      <div style={{
                        position: 'absolute', bottom: 4, left: 6,
                        fontSize: 9, color: '#fbbf24', fontWeight: 800, whiteSpace: 'nowrap',
                        textShadow: '0 1px 3px rgba(0,0,0,0.9)',
                      }}>{fmt(startTime)}</div>
                    </div>
                  )}

                  {/* ── End handle ── */}
                  {!previewInfo && duration > 0 && (
                    <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${endPct}%`, zIndex: 6, transform: 'translateX(-50%)' }}>
                      <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: 3, background: '#fbbf24', transform: 'translateX(-50%)', borderRadius: 2 }} />
                      <div style={{
                        position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
                        width: 22, height: 20, background: '#fbbf24', borderRadius: '0 0 6px 6px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'ew-resize', boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
                      }}>
                        <span style={{ color: '#000', fontSize: 9, fontWeight: 900, lineHeight: 1 }}>▶</span>
                      </div>
                      <div style={{
                        position: 'absolute', bottom: 4, right: 6,
                        fontSize: 9, color: '#fbbf24', fontWeight: 800, whiteSpace: 'nowrap',
                        textShadow: '0 1px 3px rgba(0,0,0,0.9)',
                      }}>{fmt(endTime)}</div>
                    </div>
                  )}

                  {/* ── Playhead ── */}
                  {duration > 0 && (
                    <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${playPct}%`, zIndex: 8, pointerEvents: 'none', transform: 'translateX(-50%)' }}>
                      <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: 2, background: 'var(--green)', transform: 'translateX(-50%)', boxShadow: '0 0 6px var(--green)' }} />
                      {/* Triangle head */}
                      <div style={{
                        position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
                        width: 0, height: 0,
                        borderLeft: '6px solid transparent',
                        borderRight: '6px solid transparent',
                        borderTop: '10px solid var(--green)',
                        filter: 'drop-shadow(0 0 4px var(--green))',
                      }} />
                    </div>
                  )}
                </div>

                {/* Status bar below timeline */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, padding: '2px 4px' }}>
                  <span style={{ color: '#fbbf24', fontWeight: 700 }}>▶ {fmt(startTime)}</span>
                  <span style={{ color: 'var(--green)', fontWeight: 600 }}>
                    ⏵ {fmt(currentTime)} <span style={{ color: 'var(--text-dim)' }}>/ {fmt(duration)}</span>
                  </span>
                  <span style={{ color: '#fbbf24', fontWeight: 700 }}>{fmt(endTime)} ◀</span>
                </div>

                {/* Numeric inputs for precise control */}
                {!previewInfo && (
                  <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, fontSize: 12, color: '#fbbf24' }}>
                      <span style={{ whiteSpace: 'nowrap' }}>{t('editor.start_time')}</span>
                      <input
                        type="number" step="0.1" min="0" max={endTime - 0.5}
                        value={startTime.toFixed(1)}
                        onChange={e => setStartTime(Math.max(0, Math.min(parseFloat(e.target.value) || 0, endTime - 0.5)))}
                        style={{ flex: 1, padding: '4px 8px', background: '#111', border: '1px solid #fbbf24', borderRadius: 4, color: '#fbbf24', fontSize: 12 }}
                      />
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, fontSize: 12, color: '#fbbf24' }}>
                      <span style={{ whiteSpace: 'nowrap' }}>{t('editor.end_time')}</span>
                      <input
                        type="number" step="0.1" min={startTime + 0.5} max={duration}
                        value={endTime.toFixed(1)}
                        onChange={e => setEndTime(Math.min(duration, Math.max(parseFloat(e.target.value) || 0, startTime + 0.5)))}
                        style={{ flex: 1, padding: '4px 8px', background: '#111', border: '1px solid #fbbf24', borderRadius: 4, color: '#fbbf24', fontSize: 12 }}
                      />
                    </label>
                  </div>
                )}
              </div>

              {/* Audio player */}
              <audio
                ref={audioRef}
                src={previewInfo ? previewInfo.url : `/api/songs/${selectedSong.id}/stream/`}
                onLoadedMetadata={handleLoadedMetadata}
                onTimeUpdate={handleTimeUpdate}
                style={{ width: '100%' }}
                controls
              />

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 12 }}>
                {!previewInfo ? (
                  <button onClick={handleGeneratePreview} disabled={isProcessing} style={{ flex: 1, padding: '14px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 800, fontSize: 15, cursor: 'pointer' }}>
                    {isProcessing ? '...' : t('editor.apply_trim')}
                  </button>
                ) : (
                  <>
                    <button onClick={handleConfirmTrim} disabled={isProcessing} style={{ flex: 2, padding: '14px', background: 'var(--green)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 800, fontSize: 15, cursor: 'pointer' }}>
                      {isProcessing ? '...' : t('editor.confirm_replace')}
                    </button>
                    <button onClick={() => setPreviewInfo(null)} style={{ flex: 1, padding: '14px', background: 'transparent', color: '#ff4d4d', border: '1px solid #ff4d4d', borderRadius: 10, cursor: 'pointer' }}>
                      {t('editor.discard_preview')}
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', color: 'var(--text-dim)', margin: 'auto' }}>
              <Scissors size={40} style={{ marginBottom: 20 }} />
              <h2>{t('editor.title')}</h2>
              <p>{t('editor.select_song')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
