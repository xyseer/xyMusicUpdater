import React from 'react';

export const PermanentLog = ({ entries }) => (
  <div style={{ background: 'var(--surface2)', padding: 12, borderRadius: 8, fontSize: 12 }}>
    {entries.map((log, i) => (
      <div key={i} style={{ marginBottom: 6, borderBottom: '1px solid #333', paddingBottom: 4 }}>
        <div style={{ fontWeight: 600 }}>{log.filename}</div>
        <div style={{ color: 'var(--text-dim)' }}>Reason: {log.reason} | Playlist: {log.playlist}</div>
        <div style={{ fontSize: 10, color: '#555' }}>{new Date(log.moved_at).toLocaleString()}</div>
      </div>
    ))}
    {entries.length === 0 && <div style={{ color: '#555' }}>No permanent logs.</div>}
  </div>
);
