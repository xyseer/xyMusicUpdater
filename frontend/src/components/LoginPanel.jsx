import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import CryptoJS from 'crypto-js';
import defaultBg from '../assets/default-cover.svg';

export const LoginPanel = ({ onLogin, notify }) => {
  const { t } = useTranslation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [bgUrl, setBgUrl] = useState(null);
  const [ekey, setEkey] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    // 1. Get status for background and encryption key
    api.getStatus().then(status => {
        if (status.ekey) setEkey(status.ekey);
    }).catch(() => {});

    // 2. Check if custom background exists
    const img = new Image();
    img.src = '/api/config/background/';
    img.onload = () => setBgUrl('/api/config/background/');
    img.onerror = () => setBgUrl(defaultBg);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    if (!ekey) {
        notify("System initializing, please wait...", "warning");
        return;
    }
    
    setIsLoading(true);
    try {
      // AES Encryption
      const key = CryptoJS.enc.Utf8.parse(ekey);
      const iv = CryptoJS.lib.WordArray.random(16);
      const encrypted = CryptoJS.AES.encrypt(password, key, { iv: iv });
      
      // Backend expects base64(iv + ciphertext)
      const combined = iv.concat(encrypted.ciphertext);
      const b64 = CryptoJS.enc.Base64.stringify(combined);

      await api.login(username, b64);
      onLogin();
    } catch (err) {
      const serverErr = err.response?.data?.error;
      const displayMsg = serverErr === 'Invalid credentials' ? t('app.wrong_credentials') : (serverErr || t('app.login_failed'));
      setErrorMsg(displayMsg);
      notify(displayMsg, "error");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ 
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', 
      position: 'fixed', inset: 0, zIndex: 9999,
      backgroundImage: `url(${bgUrl})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat'
    }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}></div>
      <div style={{ background: 'var(--surface)', padding: 40, borderRadius: 12, width: '100%', maxWidth: 400, boxShadow: '0 8px 32px rgba(0,0,0,0.8)', zIndex: 1, border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
          <div style={{ width: 64, height: 64, background: 'var(--surface2)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Lock size={32} color="var(--accent)" />
          </div>
        </div>
        <h2 style={{ textAlign: 'center', margin: '0 0 8px' }}>MusicUpdater</h2>
        <p style={{ textAlign: 'center', color: 'var(--text-dim)', marginBottom: 24, fontSize: 13 }}>Please login to manage your library</p>
        
        {errorMsg && (
            <div style={{ background: 'rgba(235, 87, 87, 0.1)', color: 'var(--red)', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 20, border: '1px solid rgba(235, 87, 87, 0.2)', textAlign: 'center', fontWeight: 600 }}>
                {errorMsg}
            </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <input 
            type="text" 
            placeholder="Username" 
            value={username}
            onChange={e => { setUsername(e.target.value); setErrorMsg(''); }}
            style={{ padding: '12px 16px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: '#fff', fontSize: 16 }}
            required
          />
          <input 
            type="password" 
            placeholder="Password" 
            value={password}
            onChange={e => { setPassword(e.target.value); setErrorMsg(''); }}
            style={{ padding: '12px 16px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: '#fff', fontSize: 16 }}
            required
          />
          <button 
            type="submit" 
            disabled={isLoading}
            style={{ padding: '14px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 16, fontWeight: 700, marginTop: 8 }}
          >
            {isLoading ? "Logging in..." : "Login"}
          </button>
        </form>
      </div>
    </div>
  );
};
