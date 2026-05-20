import React from 'react';

export const LiveLog = ({ entries, isLive }) => (
  <div style={{ background: '#111', padding: 10, borderRadius: 8, height: 200, overflowY: 'auto', fontFamily: 'monospace', fontSize: 12 }}>
    {entries.map((log, i) => {
      const timeStr = log.ts ? new Date(log.ts).toLocaleTimeString() : new Date().toLocaleTimeString();
      return (
        <div key={i} style={{ color: log.level === 'error' ? 'var(--red)' : log.level === 'warning' ? 'orange' : '#ccc', marginBottom: 2 }}>
          [{timeStr}] {log.message}
        </div>
      );
    })}
    {entries.length === 0 && <div style={{ color: '#555' }}>No events yet...</div>}
  </div>
);
