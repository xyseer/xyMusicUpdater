import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { Play, Clock, Settings, RefreshCw, CheckCircle } from 'lucide-react';

const jobCardStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface)', padding: 16, borderRadius: 6, border: '1px solid var(--border)' };
const iconBoxStyle = { width: 40, height: 40, background: 'rgba(155,81,224,0.1)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' };
const triggerBtnStyle = { display: 'flex', alignItems: 'center', padding: '8px 16px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600, fontSize: 13 };
const refreshBtnStyle = { background: 'transparent', border: '1px solid #444', color: '#888', borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center' };
const selectStyle = { background: 'transparent', border: 'none', color: '#fff', fontSize: 12, cursor: 'pointer', outline: 'none', padding: '4px 0' };
const infoBoxStyle = { background: 'rgba(155,81,224,0.05)', border: '1px solid var(--accent)', padding: 16, borderRadius: 8 };

export const SchedulerPanel = ({ config, onUpdate, notify }) => {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isTriggering, setIsTriggering] = useState(null);

  const fetchInfo = async () => {
    setLoading(true);
    try {
      const data = await api.getSchedulerInfo();
      setJobs(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInfo();
    const inv = setInterval(fetchInfo, 30000);
    return () => clearInterval(inv);
  }, []);

  const handleTrigger = async (taskId) => {
    setIsTriggering(taskId);
    try {
      await api.triggerSchedulerTask(taskId);
      notify("Task triggered successfully!");
      fetchInfo();
    } catch (e) {
      notify("Trigger failed: " + e.message, "error");
    } finally {
      setIsTriggering(null);
    }
  };

  const updateInterval = async (key, valueMins) => {
    const realValue = key === 'DAEMON_INTERVAL' ? valueMins * 60 : valueMins;
    try {
      await api.updateConfig({ [key]: realValue });
      notify("Interval updated and scheduler reloaded.");
      onUpdate();
      fetchInfo();
    } catch (e) {
      notify("Update failed: " + e.message, "error");
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ background: 'var(--surface2)', padding: 20, borderRadius: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0 }}>Background Tasks</h3>
          <button onClick={fetchInfo} style={refreshBtnStyle}>
            <RefreshCw size={14} style={{ marginRight: 6 }} /> Refresh Status
          </button>
        </div>

        {loading && jobs.length === 0 ? <div>Loading scheduler info...</div> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {jobs.map(job => (
              <div key={job.id} style={jobCardStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={iconBoxStyle}>
                    <Clock size={20} color="var(--accent)" />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{job.id === 'music_pipeline' ? 'Main Music Pipeline (Fetch/Tag/Purge)' : 'Keyword Discovery Engine'}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>
                      Next Execution: <span style={{ color: '#fff', fontWeight: 600 }}>{job.next_run ? new Date(job.next_run).toLocaleString() : 'Not Scheduled'}</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', background: '#0a0a0c', borderRadius: 4, padding: '2px 8px' }}>
                    <Settings size={12} style={{ marginRight: 6, color: 'var(--text-dim)' }} />
                    <select 
                      defaultValue={job.id === 'music_pipeline' ? Math.round(config.DAEMON_INTERVAL / 60) : config.DISCOVERY_INTERVAL_MINS}
                      onChange={(e) => updateInterval(job.id === 'music_pipeline' ? 'DAEMON_INTERVAL' : 'DISCOVERY_INTERVAL_MINS', e.target.value)}
                      style={selectStyle}
                    >
                      <option value="15">Every 15 Mins</option>
                      <option value="30">Every 30 Mins</option>
                      <option value="60">Every 1 Hour</option>
                      <option value="120">Every 2 Hours</option>
                      <option value="360">Every 6 Hours</option>
                      <option value="720">Every 12 Hours</option>
                      <option value="1440">Every 24 Hours</option>
                    </select>
                  </div>

                  <button 
                    onClick={() => handleTrigger(job.id)} 
                    disabled={isTriggering === job.id}
                    style={triggerBtnStyle}
                  >
                    <Play size={14} style={{ marginRight: 6 }} /> Run Now
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={infoBoxStyle}>
        <div style={{ fontWeight: 800, fontSize: 11, marginBottom: 8, color: 'var(--accent)' }}>SCHEDULER LOGIC</div>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.6 }}>
          <li>Main Pipeline handles fetching from sources, auto-tagging, and storage purging.</li>
          <li>Discovery Engine iterates through your active keyword/link subscriptions.</li>
          <li>Manual "Run Now" triggers a background thread and does not affect the next scheduled time.</li>
          <li>Changing intervals will immediately restart the scheduler with new values.</li>
        </ul>
      </div>
    </div>
  );
};
