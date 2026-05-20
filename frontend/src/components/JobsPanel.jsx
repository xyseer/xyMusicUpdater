import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Activity, Clock, CheckCircle, XCircle } from 'lucide-react';

export const JobsPanel = ({ jobs }) => {
  const [expandedId, setEditingId] = useState(null);

  const toggle = (id) => {
    setEditingId(expandedId === id ? null : id);
  };

  if (!jobs || jobs.length === 0) {
    return <div style={{ color: 'var(--text-dim)', textAlign: 'center', padding: 40 }}>No job history yet.</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {jobs.map((job) => (
        <div key={job.id} style={{ background: 'var(--surface2)', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
          <div 
            onClick={() => toggle(job.id)}
            style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {job.status === 'done' ? <CheckCircle size={16} color="var(--green)" /> : 
               job.status === 'failed' ? <XCircle size={16} color="var(--red)" /> : 
               <Clock size={16} className="spin" color="var(--accent)" />}
              
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, textTransform: 'uppercase' }}>{job.job_type}</div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{new Date(job.created_at).toLocaleString()}</div>
              </div>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              {job.url && <div style={{ fontSize: 12, color: 'var(--accent)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{job.url}</div>}
              {expandedId === job.id ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
            </div>
          </div>

          {expandedId === job.id && (
            <div style={{ padding: '0 16px 16px 16px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-dim)', marginBottom: 8, letterSpacing: 1 }}>DETAILED LOGS</div>
                <div style={{ background: '#0a0a0c', borderRadius: 4, padding: 10, maxHeight: 300, overflowY: 'auto' }}>
                  {job.logs && job.logs.length > 0 ? (
                    job.logs.map((log, idx) => (
                      <div key={idx} style={{ fontSize: 11, color: log.level === 'error' ? 'var(--red)' : '#ccc', marginBottom: 4, fontFamily: 'monospace' }}>
                        [{new Date(log.timestamp).toLocaleTimeString()}] {log.message}
                      </div>
                    ))
                  ) : (
                    <div style={{ color: '#555', fontSize: 11 }}>No detailed logs found for this job.</div>
                  )}
                </div>
              </div>

              {job.songs_added && job.songs_added.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-dim)', marginBottom: 8, letterSpacing: 1 }}>SONGS ADDED ({job.songs_added.length})</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {job.songs_added.map(song => (
                      <div key={song.id} style={{ fontSize: 12, color: 'var(--text)' }}>
                        • {song.title || song.filename} <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>({song.artist})</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
