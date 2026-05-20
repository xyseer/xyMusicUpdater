import React from 'react';
import { api } from '../api';

export const ActionBar = ({ onAction }) => {
  const handleCron = async () => { await api.triggerCron(); onAction(); };
  const handleRescan = async () => { await api.triggerRescan(); onAction(); };
  const handlePurge = async () => { await api.triggerPurge(); onAction(); };

  return (
    <div style={{ display: 'flex', gap: 10 }}>
      <button onClick={handleCron} style={btnStyle}>Run Pipeline</button>
      <button onClick={handleRescan} style={btnStyle}>Rescan Navidrome</button>
      <button onClick={handlePurge} style={btnStyle}>Force Purge</button>
    </div>
  );
};

const btnStyle = { padding: '8px 16px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--surface2)', color: '#fff', cursor: 'pointer' };
