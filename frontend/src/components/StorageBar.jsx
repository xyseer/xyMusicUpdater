import React from 'react';

export const StorageBar = ({ storage }) => {
  if (!storage) return <div style={{ fontSize: 11, color: '#555', padding: '0 20px' }}>Loading storage...</div>;
  
  return (
    <div style={{ padding: '0 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 11, fontWeight: 700 }}>
        <span style={{ color: 'var(--text-dim)', letterSpacing: 1 }}>STORAGE</span>
        <span style={{ color: storage.percent > 90 ? 'var(--red)' : 'var(--text)' }}>{storage.percent}%</span>
      </div>
      <div style={{ width: '100%', height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ 
          width: `${storage.percent}%`, 
          height: '100%', 
          background: storage.percent > 90 ? 'var(--red)' : 'var(--accent)',
          boxShadow: storage.percent > 90 ? '0 0 10px var(--red)' : 'none',
          borderRadius: 3,
          transition: 'width 0.5s ease'
        }} />
      </div>
      <div style={{ marginTop: 6, fontSize: 10, color: 'var(--text-dim)', textAlign: 'right' }}>
        {storage.used_gb} GB / {storage.total_gb} GB
      </div>
    </div>
  );
};
