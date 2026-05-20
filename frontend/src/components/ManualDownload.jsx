import React, { useState } from 'react';
import { api } from '../api';

export const ManualDownload = ({ onJobStarted }) => {
  const [url, setUrl] = useState('');
  const [allowPlaylist, setAllowPlaylist] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!url) return;
    await api.manualDownload(url, allowPlaylist);
    setUrl('');
    onJobStarted();
  };

  return (
    <div>
      <div style={{ marginBottom: 10, fontWeight: 700, fontSize: 10, letterSpacing: 3, textTransform: 'uppercase', color: 'var(--text-dim)' }}>Manual Download</div>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <input 
            type="text" 
            value={url} 
            onChange={(e) => setUrl(e.target.value)} 
            placeholder="YouTube/SoundCloud URL" 
            style={{ flex: 1, padding: '8px 12px', borderRadius: 4, border: '1px solid var(--border)', background: '#1c1c21', color: '#fff' }}
          />
          <button type="submit" style={{ padding: '8px 16px', borderRadius: 4, border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>Download</button>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text-dim)', cursor: 'pointer' }}>
          <input 
            type="checkbox" 
            checked={allowPlaylist} 
            onChange={(e) => setAllowPlaylist(e.target.checked)} 
          />
          Enable whole playlist download
        </label>
      </form>
    </div>
  );
};
