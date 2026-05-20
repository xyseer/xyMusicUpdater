import React, { useEffect, useState } from 'react';
import { api } from '../api';

export const PlaylistSelector = ({ monitoredPlaylists, onUpdate }) => {
  const [allPlaylists, setAllPlaylists] = useState([]);
  const [loading, setLoading] = useState(true);

  // Parse "p1, p2" into ["p1", "p2"]
  const selectedNames = monitoredPlaylists 
    ? monitoredPlaylists.split(',').map(s => s.trim()).filter(Boolean) 
    : [];

  useEffect(() => {
    api.getPlaylists().then(data => {
      setAllPlaylists(data);
      setLoading(false);
    });
  }, []);

  const toggle = async (name) => {
    let next;
    if (selectedNames.includes(name)) {
      next = selectedNames.filter(n => n !== name);
    } else {
      next = [...selectedNames, name];
    }
    
    const newValue = next.join(', ');
    try {
        // We fetch current config first to avoid overwriting other fields if they changed
        const currentConfig = await api.getConfig();
        await api.updateConfig({ ...currentConfig, MONITORED_PLAYLISTS: newValue });
        onUpdate(); // Trigger refresh in App.jsx if needed
    } catch (e) {
        console.error("Failed to update monitored playlists", e);
        alert("Failed to save playlist protection settings.");
    }
  };

  if (loading) return <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Loading playlists...</div>;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {allPlaylists.map(p => (
        <div 
          key={p.id} 
          onClick={() => toggle(p.name)}
          style={{ 
            padding: '4px 12px', borderRadius: 20, cursor: 'pointer', fontSize: 12, fontWeight: 600,
            border: `1px solid ${selectedNames.includes(p.name) ? 'var(--accent)' : 'var(--border)'}`,
            background: selectedNames.includes(p.name) ? 'rgba(155,81,224,0.15)' : 'var(--surface2)',
            color: selectedNames.includes(p.name) ? 'var(--accent)' : 'var(--text-dim)',
            transition: 'all 0.2s ease'
          }}
        >
          {p.name}
        </div>
      ))}
      {allPlaylists.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No playlists found.</div>}
    </div>
  );
};
