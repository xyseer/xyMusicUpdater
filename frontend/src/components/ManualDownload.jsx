import React, { useState, useRef } from 'react';
import { api } from '../api';
import { Download, Search, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ScrollingText } from './ScrollingText';

export const ManualDownload = ({ onJobStarted, notify, config }) => {
  const { t } = useTranslation();
  const [inputVal, setInputVal] = useState('');
  const [provider, setProvider] = useState(config?.DOWNLOAD_PROVIDER || 'youtube');
  const [allowPlaylist, setAllowPlaylist] = useState(false);
  const [overrideDuplicate, setOverrideDuplicate] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const uploadInputRef = useRef(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!inputVal) return;
    if (inputVal.startsWith('http://') || inputVal.startsWith('https://')) {
      await api.manualDownload(inputVal, allowPlaylist, overrideDuplicate);
      setInputVal('');
      setSearchResults([]);
      onJobStarted();
    } else {
      setIsSearching(true);
      setSearchResults([]);
      try {
        const results = await api.searchMedia(inputVal, provider);
        setSearchResults(results || []);
      } catch (err) {
        if (notify) notify("Search failed: " + err.message, "error");
      } finally {
        setIsSearching(false);
      }
    }
  };

  const triggerDownload = async (targetUrl, forcePlaylist = false) => {
    await api.manualDownload(targetUrl, forcePlaylist || allowPlaylist, overrideDuplicate);
    setInputVal('');
    setSearchResults([]);
    onJobStarted();
  };

  const handleUpload = async (files) => {
    const audioFiles = Array.from(files).filter(f =>
      /\.(mp3|flac|m4a|opus|ogg|webm|wav)$/i.test(f.name)
    );
    if (!audioFiles.length) {
      if (notify) notify(t('downloads.upload_no_audio'), "error");
      return;
    }
    setIsUploading(true);
    try {
      await api.uploadSongs(audioFiles);
      if (notify) notify(t('downloads.upload_started', { count: audioFiles.length }));
      onJobStarted();
    } catch (err) {
      if (notify) notify("Upload failed: " + err.message, "error");
    } finally {
      setIsUploading(false);
    }
  };

  const formatTime = (sec) => {
    if (!sec) return '--:--';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const isUrl = inputVal.startsWith('http://') || inputVal.startsWith('https://');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* URL / Keyword download */}
      <div>
        <div style={{ marginBottom: 10, fontWeight: 700, fontSize: 10, letterSpacing: 3, textTransform: 'uppercase', color: 'var(--text-dim)' }}>{t('downloads.title')}</div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Search source toggle — applies to keyword searches (URLs download from either source directly) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{t('downloads.search_source')}</span>
            <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
              {[
                { id: 'youtube', label: t('downloads.provider_youtube') },
                { id: 'soundcloud', label: t('downloads.provider_soundcloud') },
              ].map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setProvider(p.id)}
                  style={{
                    padding: '5px 14px', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                    background: provider === p.id ? 'var(--accent)' : 'transparent',
                    color: provider === p.id ? '#fff' : 'var(--text-dim)',
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <input
              type="text"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              placeholder={provider === 'soundcloud' ? t('downloads.placeholder_soundcloud') : t('downloads.placeholder')}
              style={{ flex: 1, padding: '8px 12px', borderRadius: 4, border: '1px solid var(--border)', background: '#1c1c21', color: '#fff' }}
            />
            <button type="submit" disabled={isSearching} style={{ padding: '8px 16px', borderRadius: 4, border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
              {isSearching ? '...' : (isUrl ? <><Download size={14}/> {t('downloads.download')}</> : <><Search size={14}/> {t('downloads.search')}</>)}
            </button>
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text-dim)', cursor: 'pointer' }}>
              <input type="checkbox" checked={allowPlaylist} onChange={(e) => setAllowPlaylist(e.target.checked)} />
              {t('downloads.enable_playlist')}
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text-dim)', cursor: 'pointer' }}>
              <input type="checkbox" checked={overrideDuplicate} onChange={(e) => setOverrideDuplicate(e.target.checked)} />
              {t('downloads.override_duplicate')}
            </label>
          </div>
        </form>
      </div>

      {/* File upload drop zone */}
      <div>
        <div style={{ marginBottom: 8, fontWeight: 700, fontSize: 10, letterSpacing: 3, textTransform: 'uppercase', color: 'var(--text-dim)' }}>{t('downloads.upload_title')}</div>
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleUpload(e.dataTransfer.files); }}
          onClick={() => uploadInputRef.current?.click()}
          style={{
            padding: '20px 16px', borderRadius: 6,
            border: `2px dashed ${isDragging ? 'var(--accent)' : 'var(--border)'}`,
            background: isDragging ? 'rgba(var(--accent-rgb,155,81,224),0.08)' : 'var(--surface)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            color: isDragging ? 'var(--accent)' : 'var(--text-dim)', fontSize: 13, transition: 'all 0.15s',
          }}
        >
          <Upload size={18} />
          {isUploading ? t('downloads.uploading') : t('downloads.upload_hint')}
        </div>
        <input
          ref={uploadInputRef}
          type="file" multiple accept=".mp3,.flac,.m4a,.opus,.ogg,.webm,.wav"
          style={{ display: 'none' }}
          onChange={(e) => handleUpload(e.target.files)}
        />
      </div>

      {searchResults.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {searchResults.map((res, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, padding: 10, background: 'var(--surface)', borderRadius: 6, alignItems: 'center' }}>
              <div style={{ width: 80, height: 45, background: '#000', borderRadius: 4, overflow: 'hidden' }}>
                {res.thumbnail && <img src={res.thumbnail} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="thumb" />}
              </div>
              <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                <ScrollingText text={res.title} style={{ fontWeight: 600, fontSize: 13 }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <ScrollingText text={res.uploader} style={{ color: 'var(--text-dim)', fontSize: 11, flex: 1 }} />
                  <span style={{ color: 'var(--text-dim)', fontSize: 11, flexShrink: 0 }}>• {formatTime(res.duration)}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => triggerDownload(res.url)} style={{ padding: '6px 12px', borderRadius: 4, border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Download size={12}/> {t('downloads.fetch')}
                </button>
                {res.id && res.url && res.url.includes('youtube.com') && (
                  <button onClick={() => triggerDownload(`https://www.youtube.com/watch?v=${res.id}&list=RD${res.id}`, true)} style={{ padding: '6px 12px', borderRadius: 4, border: '1px solid var(--accent)', background: 'transparent', color: 'var(--accent)', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Download size={12}/> {t('downloads.fetch_mix')}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
