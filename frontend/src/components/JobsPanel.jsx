import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { ChevronDown, ChevronRight, ChevronLeft, Clock, CheckCircle, XCircle } from 'lucide-react';

const PAGE_SIZE = 20;

export const JobsPanel = ({ notify }) => {
  const [jobs, setJobs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);

  const fetchJobs = useCallback(async (p = page) => {
    try {
      const data = await api.getJobs(null, p, PAGE_SIZE);
      setJobs(data.results || []);
      setTotal(data.total || 0);
    } catch (e) {
      console.error("Failed to fetch jobs", e);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchJobs(page);
    const interval = setInterval(() => fetchJobs(page), 10000);
    return () => clearInterval(interval);
  }, [page, fetchJobs]);

  const toggle = (id) => setExpandedId(expandedId === id ? null : id);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const Pagination = () => {
    if (totalPages <= 1) return null;
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 15, padding: '16px', borderTop: '1px solid #222' }}>
        <button
          disabled={page === 1 || loading}
          onClick={() => setPage(p => p - 1)}
          style={{ background: 'transparent', border: 'none', color: page === 1 ? '#444' : 'var(--accent)', cursor: page === 1 ? 'default' : 'pointer' }}
        >
          <ChevronLeft size={20} />
        </button>
        <span style={{ fontSize: 13, fontWeight: 600 }}>
          {loading ? '...' : `Page ${page} / ${totalPages}`}
        </span>
        <button
          disabled={page === totalPages || loading}
          onClick={() => setPage(p => p + 1)}
          style={{ background: 'transparent', border: 'none', color: page === totalPages ? '#444' : 'var(--accent)', cursor: page === totalPages ? 'default' : 'pointer' }}
        >
          <ChevronRight size={20} />
        </button>
      </div>
    );
  };

  if (loading && jobs.length === 0) {
    return <div style={{ color: 'var(--text-dim)', textAlign: 'center', padding: 40 }}>Loading job history...</div>;
  }

  if (total === 0 && !loading) {
    return <div style={{ color: 'var(--text-dim)', textAlign: 'center', padding: 40 }}>No job history yet.</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, background: 'var(--surface2)', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {jobs.map((job) => (
          <div key={job.id} style={{ borderBottom: '1px solid var(--border)' }}>
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
      <Pagination />
    </div>
  );
};
