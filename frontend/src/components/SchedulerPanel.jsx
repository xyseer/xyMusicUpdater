import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { Play, Clock, Settings, RefreshCw, Calendar, Search, Wrench } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const jobCardStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface)', padding: 16, borderRadius: 6, border: '1px solid var(--border)', marginBottom: 12 };
const iconBoxStyle = { width: 32, height: 32, background: 'rgba(155,81,224,0.1)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' };
const triggerBtnStyle = { display: 'flex', alignItems: 'center', padding: '8px 16px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600, fontSize: 13 };
const refreshBtnStyle = { background: 'transparent', border: '1px solid #444', color: '#888', borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center' };
const selectStyle = { background: 'transparent', border: 'none', color: '#fff', fontSize: 12, cursor: 'pointer', outline: 'none', padding: '4px 0' };
const infoBoxStyle = { background: 'rgba(155,81,224,0.05)', border: '1px solid var(--accent)', padding: 16, borderRadius: 8 };

export const SchedulerPanel = ({ config, onUpdate, notify }) => {
  const { t } = useTranslation();
  const [events, setEvents] = useState([]);
  const [maintenanceJobs, setMaintenanceJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isTriggering, setIsTriggering] = useState(null);
  const [customMode, setCustomMode] = useState(false);

  const fetchInfo = async () => {
    setLoading(true);
    try {
      const data = await api.getSchedulerInfo();
      // API returns { events, maintenance_jobs } — fall back to bare array for safety
      const evts = Array.isArray(data) ? data : (data.events || []);
      const maint = Array.isArray(data) ? [] : (data.maintenance_jobs || []);
      setEvents(evts);
      setMaintenanceJobs(maint);

      const presets = ["1", "2", "6", "12", "24", "48"];
      if (!presets.includes(String(config.DAEMON_INTERVAL_HOURS))) setCustomMode(true);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInfo();
    const inv = setInterval(fetchInfo, 60000);
    return () => clearInterval(inv);
  }, [config.DAEMON_INTERVAL_HOURS]);

  const handleTrigger = async (taskId) => {
    setIsTriggering(taskId);
    try {
      await api.triggerSchedulerTask(taskId);
      notify("Task triggered successfully!");
      setTimeout(fetchInfo, 1000);
    } catch (e) {
      notify("Trigger failed: " + e.message, "error");
    } finally {
      setIsTriggering(null);
    }
  };

  const updateInterval = async (val) => {
    try {
      await api.updateConfig({ DAEMON_INTERVAL_HOURS: val });
      notify("Main pipeline interval updated.");
      onUpdate();
    } catch (e) {
      notify("Update failed: " + e.message, "error");
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* 1. Main Pipeline Configuration */}
      <div style={{ background: 'var(--surface2)', padding: 20, borderRadius: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
             <Settings size={18} color="var(--accent)" />
             <h3 style={{ margin: 0 }}>{t('scheduler.main_pipeline_config')}</h3>
          </div>
          <button onClick={fetchInfo} style={refreshBtnStyle}>
            <RefreshCw size={14} style={{ marginRight: 6 }} /> {t('scheduler.refresh')}
          </button>
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', background: '#0a0a0c', borderRadius: 4, padding: '8px 12px', border: '1px solid var(--border)', flex: 1 }}>
            <Clock size={14} style={{ marginRight: 10, color: 'var(--text-dim)' }} />
            {customMode ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                <input 
                  type="number" 
                  defaultValue={config.DAEMON_INTERVAL_HOURS}
                  onBlur={(e) => updateInterval(e.target.value)}
                  style={{ ...selectStyle, flex: 1, borderBottom: '1px solid var(--accent)' }}
                />
                <span style={{ fontSize: 12 }}>hrs</span>
                <button onClick={() => setCustomMode(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}>X</button>
              </div>
            ) : (
              <select 
                value={config.DAEMON_INTERVAL_HOURS}
                onChange={(e) => {
                  if (e.target.value === 'custom') setCustomMode(true);
                  else updateInterval(e.target.value);
                }}
                style={{ ...selectStyle, flex: 1 }}
              >
                <option value="1">{t('discovery.every')} 1 hr</option>
                <option value="2">{t('discovery.every')} 2 hrs</option>
                <option value="6">{t('discovery.every')} 6 hrs</option>
                <option value="12">{t('discovery.every')} 12 hrs</option>
                <option value="24">{t('discovery.every')} 24 hrs</option>
                <option value="48">{t('discovery.every')} 48 hrs</option>
                <option value="custom">{t('scheduler.custom')}</option>
              </select>
            )}
          </div>
          <button onClick={() => handleTrigger('music_pipeline')} disabled={isTriggering === 'music_pipeline'} style={triggerBtnStyle}>
            <Play size={14} style={{ marginRight: 8 }} /> {t('scheduler.run_now')}
          </button>
        </div>
      </div>

      {/* 2. Timeline of Upcoming Tasks */}
      <div style={{ background: 'var(--surface2)', padding: 20, borderRadius: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
           <Calendar size={18} color="var(--accent)" />
           <h3 style={{ margin: 0 }}>{t('scheduler.upcoming_title')}</h3>
        </div>

        {loading && events.length === 0 ? <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>{t('scheduler.loading')}</div> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {events.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>{t('scheduler.no_upcoming')}</div>}
            {events.map((ev, i) => (
              <div key={i} style={jobCardStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ ...iconBoxStyle, background: ev.type === 'pipeline' ? 'rgba(76,175,80,0.1)' : 'rgba(155,81,224,0.1)' }}>
                    {ev.type === 'pipeline' ? <RefreshCw size={16} color="var(--green)" /> : <Search size={16} color="var(--accent)" />}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{ev.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
                      {ev.type === 'pipeline' ? t('scheduler.type_pipeline') : t('scheduler.type_discovery')} • {new Date(ev.time).toLocaleString()}
                    </div>
                  </div>
                </div>
                {ev.id.startsWith('discovery_') && (
                   <button onClick={() => handleTrigger(ev.id)} disabled={isTriggering === ev.id} style={{ ...refreshBtnStyle, border: 'none' }}>
                     <Play size={14} />
                   </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 3. System Maintenance Jobs */}
      {maintenanceJobs.length > 0 && (
        <div style={{ background: 'var(--surface2)', padding: 20, borderRadius: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <Wrench size={18} color="var(--accent)" />
            <h3 style={{ margin: 0 }}>{t('scheduler.maintenance_title')}</h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {maintenanceJobs.map(job => (
              <div key={job.id} style={jobCardStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ ...iconBoxStyle, background: 'rgba(255,165,0,0.1)' }}>
                    <Wrench size={16} color="orange" />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{job.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
                      {job.interval_days != null
                        ? t('scheduler.every_n_days', { n: job.interval_days })
                        : '—'}
                      {job.next_run && (
                        <span style={{ marginLeft: 8 }}>
                          • {t('scheduler.next_run')} {new Date(job.next_run).toLocaleString()}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2, opacity: 0.75 }}>
                      {t('scheduler.ytdlp_update_desc')}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => handleTrigger(job.id)}
                  disabled={isTriggering === job.id}
                  style={{ ...triggerBtnStyle, background: 'orange' }}
                >
                  <Play size={14} style={{ marginRight: 8 }} />
                  {isTriggering === job.id ? '...' : t('scheduler.run_now')}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={infoBoxStyle}>
        <div style={{ fontWeight: 800, fontSize: 11, marginBottom: 8, color: 'var(--accent)' }}>{t('scheduler.logic_title')}</div>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.6 }}>
          <li>{t('scheduler.logic_1')}</li>
          <li>{t('scheduler.logic_2')}</li>
          <li>{t('scheduler.logic_3')}</li>
          <li>{t('scheduler.logic_4')}</li>
        </ul>
      </div>
    </div>
  );
};
