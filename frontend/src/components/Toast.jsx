import React, { useEffect } from 'react';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';

export const Toast = ({ message, type = 'success', onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const styles = {
    container: {
      position: 'fixed', top: 24, right: 24, zIndex: 10000,
      minWidth: 300, padding: '16px 20px', borderRadius: 12,
      background: '#1c1c21', border: '1px solid var(--border)',
      boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', gap: 12,
      animation: 'toast-in 0.3s ease-out'
    },
    icon: {
      color: type === 'error' ? 'var(--red)' : type === 'warning' ? 'orange' : 'var(--green)',
      flexShrink: 0
    },
    message: { flex: 1, fontSize: 14, fontWeight: 500, color: '#fff' },
    close: { background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: 4 }
  };

  return (
    <div style={styles.container}>
      <div style={styles.icon}>
        {type === 'error' ? <AlertCircle size={20} /> : type === 'info' ? <Info size={20} /> : <CheckCircle size={20} />}
      </div>
      <div style={styles.message}>{message}</div>
      <button onClick={onClose} style={styles.close}><X size={16}/></button>
      <style>{`
        @keyframes toast-in {
          from { transform: translateY(-20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
};
