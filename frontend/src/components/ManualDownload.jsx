import React, { useState } from 'react';
import { api } from '../api';
import { Download, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export const ManualDownload = ({ onJobStarted }) => {
  const { t } = useTranslation();
  const [inputVal, setInputVal] = useState('');
  const [allowPlaylist, setAllowPlaylist] = useState(false);
  const [overrideDuplicate, setOverrideDuplicate] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!inputVal) return;
    
    if (inputVal.startsWith('http://') || inputVal.startsWith('https://')) {
      // Direct Download
      await api.manualDownload(inputVal, allowPlaylist, overrideDuplicate);
      setInputVal('');
      setSearchResults([]);
      onJobStarted();
    } else {
      // Search
      setIsSearching(true);
      setSearchResults([]);
      try {
        const results = await api.searchMedia(inputVal);
        setSearchResults(results || []);
      } catch (err) {
        alert("Search failed: " + err.message);
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

  const formatTime = (sec) => {
    if (!sec) return '--:--';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const isUrl = inputVal.startsWith('http://') || inputVal.startsWith('https://');

  return (
    <div>
      <div style={{ marginBottom: 10, fontWeight: 700, fontSize: 10, letterSpacing: 3, textTransform: 'uppercase', color: 'var(--text-dim)' }}>{t('downloads.title')}</div>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <input 
            type="text" 
            value={inputVal} 
            onChange={(e) => setInputVal(e.target.value)} 
            placeholder={t('downloads.placeholder')} 
            style={{ flex: 1, padding: '8px 12px', borderRadius: 4, border: '1px solid var(--border)', background: '#1c1c21', color: '#fff' }}
          />
          <button type="submit" disabled={isSearching} style={{ padding: '8px 16px', borderRadius: 4, border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            {isSearching ? '...' : (isUrl ? <><Download size={14}/> {t('downloads.download')}</> : <><Search size={14}/> {t('downloads.search')}</>)}
          </button>
        </div>
        <div style={{ display: 'flex', gap: 16 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text-dim)', cursor: 'pointer' }}>
            <input 
              type="checkbox" 
              checked={allowPlaylist} 
              onChange={(e) => setAllowPlaylist(e.target.checked)} 
            />
            {t('downloads.enable_playlist')}
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text-dim)', cursor: 'pointer' }}>
            <input 
              type="checkbox" 
              checked={overrideDuplicate} 
              onChange={(e) => setOverrideDuplicate(e.target.checked)} 
            />
            {t('downloads.override_duplicate')}
          </label>
        </div>
      </form>

      {searchResults.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 15 }}>
          {searchResults.map((res, i) => (
             <div key={i} style={{ display: 'flex', gap: 12, padding: 10, background: 'var(--surface)', borderRadius: 6, alignItems: 'center' }}>
                <div style={{ width: 80, height: 45, background: '#000', borderRadius: 4, overflow: 'hidden' }}>
                  {res.thumbnail && <img src={res.thumbnail} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="thumb" />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                   <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{res.title}</div>
                   <div style={{ color: 'var(--text-dim)', fontSize: 11 }}>{res.uploader} • {formatTime(res.duration)}</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => triggerDownload(res.url)} style={{ padding: '6px 12px', borderRadius: 4, border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Download size={12}/> {t('downloads.fetch')}
                  </button>
                  {res.id && res.url && res.url.includes('youtube.com') && (
                    <button onClick={() => triggerDownload(`https://www.youtube.com/watch?v=${res.id}&list=RD${res.id}`, true)} style={{ padding: '6px 12px', borderRadius: 4, border: '1px solid var(--accent)', background: 'transparent', color: 'var(--accent)', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }} title="Download YouTube Mix (Radio) for this song">
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
