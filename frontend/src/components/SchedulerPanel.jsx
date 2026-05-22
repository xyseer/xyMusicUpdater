import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { Play, Clock, Settings, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const jobCardStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface)', padding: 16, borderRadius: 6, border: '1px solid var(--border)' };
const iconBoxStyle = { width: 40, height: 40, background: 'rgba(155,81,224,0.1)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' };
const triggerBtnStyle = { display: 'flex', alignItems: 'center', padding: '8px 16px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600, fontSize: 13 };
const refreshBtnStyle = { background: 'transparent', border: '1px solid #444', color: '#888', borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center' };
const selectStyle = { background: 'transparent', border: 'none', color: '#fff', fontSize: 12, cursor: 'pointer', outline: 'none', padding: '4px 0' };
const infoBoxStyle = { background: 'rgba(155,81,224,0.05)', border: '1px solid var(--accent)', padding: 16, borderRadius: 8 };

export const SchedulerPanel = ({ config, onUpdate, notify }) => {
  const { t } = useTranslation();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isTriggering, setIsTriggering] = useState(null);
  const [customJobs, setCustomJobs] = useState({}); // { jobId: boolean }

  const fetchInfo = async () => {
    setLoading(true);
    try {
      const data = await api.getSchedulerInfo();
      setJobs(data);
      
      // Auto-detect custom values not in presets
      const presets = ["1", "2", "6", "12", "24", "48"];
      const newCustoms = {};
      data.forEach(j => {
        const val = String(j.id === 'music_pipeline' ? config.DAEMON_INTERVAL_HOURS : config.DISCOVERY_INTERVAL_HOURS);
        if (!presets.includes(val)) newCustoms[j.id] = true;
      });
      setCustomJobs(prev => ({ ...prev, ...newCustoms }));
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

  const updateInterval = async (key, valueHours) => {
    try {
      await api.updateConfig({ [key]: valueHours });
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
          <h3 style={{ margin: 0 }}>{t('scheduler.title')}</h3>
          <button onClick={fetchInfo} style={refreshBtnStyle}>
            <RefreshCw size={14} style={{ marginRight: 6 }} /> {t('scheduler.refresh')}
          </button>
        </div>

        {loading && jobs.length === 0 ? <div>{t('scheduler.loading')}</div> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {jobs.map(job => {
              const currentVal = job.id === 'music_pipeline' ? config.DAEMON_INTERVAL_HOURS : config.DISCOVERY_INTERVAL_HOURS;
              const isCustom = customJobs[job.id];

              return (
                <div key={job.id} style={jobCardStyle}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={iconBoxStyle}>
                      <Clock size={20} color="var(--accent)" />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 16 }}>{job.id === 'music_pipeline' ? t('scheduler.pipeline_name') : t('scheduler.discovery_name')}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>
                        {t('scheduler.next_run')} <span style={{ color: '#fff', fontWeight: 600 }}>{job.next_run ? new Date(job.next_run).toLocaleString() : t('scheduler.not_scheduled')}</span>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', background: '#0a0a0c', borderRadius: 4, padding: '2px 8px' }}>
                      <Settings size={12} style={{ marginRight: 6, color: 'var(--text-dim)' }} />
                      
                      {isCustom ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <input 
                            type="number" 
                            defaultValue={currentVal}
                            onBlur={(e) => updateInterval(job.id === 'music_pipeline' ? 'DAEMON_INTERVAL_HOURS' : 'DISCOVERY_INTERVAL_HOURS', e.target.value)}
                            style={{ ...selectStyle, width: 40, borderBottom: '1px solid var(--accent)' }}
                          />
                          <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>hrs</span>
                          <button onClick={() => setCustomJobs({...customJobs, [job.id]: false})} style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 10, padding: '0 4px' }}>X</button>
                        </div>
                      ) : (
                        <select 
                          value={currentVal}
                          onChange={(e) => {
                            if (e.target.value === 'custom') {
                              setCustomJobs({ ...customJobs, [job.id]: true });
                            } else {
                              updateInterval(job.id === 'music_pipeline' ? 'DAEMON_INTERVAL_HOURS' : 'DISCOVERY_INTERVAL_HOURS', e.target.value);
                            }
                          }}
                          style={selectStyle}
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

                    <button 
                      onClick={() => handleTrigger(job.id)} 
                      disabled={isTriggering === job.id}
                      style={triggerBtnStyle}
                    >
                      <Play size={14} style={{ marginRight: 6 }} /> {t('scheduler.run_now')}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

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
