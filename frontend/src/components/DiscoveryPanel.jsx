import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { Trash2, Play, Plus, Link, Search, Edit2, X } from 'lucide-react';

const inputGroup = { display: 'flex', flexDirection: 'column', gap: 5 };
const labelStyle = { fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 };
const inputStyle = { padding: '8px 12px', borderRadius: 4, border: '1px solid var(--border)', background: '#1c1c21', color: '#fff' };
const saveBtnStyle = { padding: '8px 16px', borderRadius: 4, border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' };
const secondaryBtnStyle = { padding: '8px 16px', borderRadius: 4, border: '1px solid var(--border)', background: 'transparent', color: '#fff', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center' };

export const DiscoveryPanel = ({ notify }) => {
  const [subs, setSubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [newSub, setNewSub] = useState({
    label: '',
    keywords: '',
    amount: 10,
    cycle_days: 7,
  });

  const fetchSubs = async () => {
    setLoading(true);
    try {
      const data = await api.getSubscriptions();
      setSubs(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubs();
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      if (editingId) {
        await api.updateSubscription(editingId, newSub);
        notify("Subscription updated!");
      } else {
        await api.addSubscription(newSub);
        notify("Subscription added successfully!");
      }
      setIsAdding(false);
      setEditingId(null);
      setNewSub({ label: '', keywords: '', amount: 10, cycle_days: 7 });
      fetchSubs();
    } catch (e) {
      notify("Failed to save subscription: " + e.message, "error");
    }
  };

  const startEdit = (sub) => {
    setEditingId(sub.id);
    setNewSub({
      label: sub.label,
      keywords: sub.keywords,
      amount: sub.amount,
      cycle_days: sub.cycle_days,
    });
    setIsAdding(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEdit = () => {
    setIsAdding(false);
    setEditingId(null);
    setNewSub({ label: '', keywords: '', amount: 10, cycle_days: 7 });
  };

  const handleDelete = async (id) => {
    if (window.confirm("Delete this discovery subscription?")) {
      await api.deleteSubscription(id);
      notify("Subscription deleted");
      fetchSubs();
    }
  };

  const handleRunAll = async () => {
    try {
      await api.runSubscriptions();
      notify("Discovery tasks triggered in background.");
    } catch (e) {
      notify("Failed to trigger: " + e.message, "error");
    }
  };

  if (loading && subs.length === 0) return <div>Loading subscriptions...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h3 style={{ margin: 0 }}>Automated Discovery</h3>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={handleRunAll} style={secondaryBtnStyle}>
            <Play size={14} style={{ marginRight: 6 }} /> Run All Now
          </button>
          <button onClick={isAdding ? cancelEdit : () => setIsAdding(true)} style={saveBtnStyle}>
            {isAdding ? <X size={14} style={{ marginRight: 6 }} /> : <Plus size={14} style={{ marginRight: 6 }} />} 
            {isAdding ? 'Cancel' : 'Add Subscription'}
          </button>
        </div>
      </div>

      {isAdding && (
        <div style={{ background: 'var(--surface2)', padding: 20, borderRadius: 8, marginBottom: 20, border: editingId ? '1px solid var(--accent)' : 'none' }}>
          <h4 style={{ marginTop: 0, marginBottom: 15, color: 'var(--accent)' }}>{editingId ? 'Edit Subscription' : 'New Subscription'}</h4>
          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={inputGroup}>
              <label style={labelStyle}>Subscription Label (e.g. My Favorite Playlist)</label>
              <input value={newSub.label} onChange={e => setNewSub({...newSub, label: e.target.value})} style={inputStyle} placeholder="Label for this task" required />
            </div>
            <div style={inputGroup}>
              <label style={labelStyle}>
                <Link size={12} /> Keywords or Playlist Links (Comma separated)
              </label>
              <textarea 
                value={newSub.keywords} 
                onChange={e => setNewSub({...newSub, keywords: e.target.value})} 
                style={{ ...inputStyle, minHeight: 80, resize: 'vertical', fontFamily: 'inherit' }} 
                placeholder="Paste YouTube/SoundCloud playlist links OR search keywords. Separate multiple entries with commas."
                required 
              />
              <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 4 }}>
                System will scan these links periodically and download only NEW songs.
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <div style={inputGroup}>
                <label style={labelStyle}>Amount per entry (for keywords)</label>
                <input type="number" value={newSub.amount} onChange={e => setNewSub({...newSub, amount: e.target.value})} style={inputStyle} />
              </div>
              <div style={inputGroup}>
                <label style={labelStyle}>Cycle Days</label>
                <input type="number" value={newSub.cycle_days} onChange={e => setNewSub({...newSub, cycle_days: e.target.value})} style={inputStyle} />
              </div>
            </div>
            <button type="submit" style={saveBtnStyle}>{editingId ? 'Update Subscription' : 'Save Subscription'}</button>
          </form>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {subs.length === 0 && <div style={{ color: 'var(--text-dim)', textAlign: 'center', padding: 40 }}>No discovery subscriptions yet.</div>}
        {subs.map(sub => (
          <div key={sub.id} style={{ background: 'var(--surface2)', padding: 16, borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 16, color: 'var(--accent)', marginBottom: 4 }}>{sub.label}</div>
              <div style={{ fontSize: 13, color: '#ccc', marginBottom: 4, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Targets: {sub.keywords}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                Every {sub.cycle_days} days • Fetch top {sub.amount} • Last run: {sub.last_run ? new Date(sub.last_run).toLocaleString() : 'Never'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 5 }}>
              <button onClick={() => startEdit(sub)} style={{ padding: 8, background: 'transparent', border: 'none', color: 'var(--accent)', cursor: 'pointer' }}>
                <Edit2 size={18} />
              </button>
              <button onClick={() => handleDelete(sub.id)} style={{ padding: 8, background: 'transparent', border: 'none', color: '#ff4d4d', cursor: 'pointer' }}>
                <Trash2 size={18} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
