import React, { useState, useRef } from 'react';
import { api } from '../api';
import { useTranslation } from 'react-i18next';

const inputStyle = { padding: '6px 10px', borderRadius: 4, border: '1px solid var(--border)', background: '#0a0a0c', color: '#fff' };
const editBtnStyle = { padding: '4px 12px', borderRadius: 4, border: '1px solid var(--accent)', background: 'transparent', color: 'var(--accent)', cursor: 'pointer' };
const saveBtnStyle = { padding: '6px 12px', borderRadius: 4, border: 'none', background: 'var(--green)', color: '#fff', cursor: 'pointer' };
const dropzoneStyle = { padding: '12px', borderRadius: 4, border: '1px dashed var(--border)', cursor: 'pointer', display: 'flex', alignItems: 'center' };

export const TaggingPanel = ({ songs, playlistMap = {}, onUpdate, notify }) => {
  const { t } = useTranslation();
  const displaySongs = songs.filter(s => (s.needs_tagging || s.pending_confirmation) && s.status === 'active');
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isAutoTagging, setIsAutoTagging] = useState(false);
  const fileInputRef = useRef(null);

  const startEdit = (song) => {
    setEditingId(song.id);
    setFormData({ 
      title: song.title || '', 
      artist: song.artist || '', 
      album: song.album || '',
      album_artist: song.album_artist || '',
      cover_url: ''
    });
    setSearchQuery(song.title || '');
    setSearchResults([]);
  };

  const save = async (id) => {
    try {
      await api.updateSong(id, { ...formData, needs_tagging: false, pending_confirmation: false });
      setEditingId(null);
      notify("Tags saved successfully! Syncing to Navidrome...");
      onUpdate();
    } catch (e) {
      notify("Failed to save tags: " + (e.response?.data?.error || e.message), "error");
    }
  };

  const handleConfirm = async (id) => {
    try {
      await api.confirmTags([id]);
      notify("Tags confirmed successfully!");
      onUpdate();
    } catch (e) {
      notify("Failed to confirm tags", "error");
    }
  };

  const handleReject = async (id) => {
    try {
      await api.rejectTags([id]);
      notify("Tags rejected");
      onUpdate();
    } catch (e) {
      notify("Failed to reject tags", "error");
    }
  };

  const handleRevert = async (id) => {
    if (window.confirm("Roll back to the file's original embedded metadata?")) {
      try {
        await api.revertSong(id);
        notify("Restored to original metadata!");
        setEditingId(null);
        onUpdate();
      } catch (e) {
        notify("Failed to restore metadata: " + e.message, "error");
      }
    }
  };

  const handleAutoTagAll = async () => {
    setIsAutoTagging(true);
    notify("Auto-tagging batch started...");
    try {
      await api.autoTagAll();
      notify("Batch auto-tagging complete! Please review the drafted tags.");
      onUpdate();
    } catch (e) {
      notify("Auto-tagging failed: " + e.message, "error");
    } finally {
      setIsAutoTagging(false);
    }
  };

  const performSearch = async () => {
    if (!searchQuery) return;
    setIsSearching(true);
    setSearchResults([]);
    try {
      const results = await api.searchMusicBrainz(searchQuery);
      setSearchResults(results || []);
    } catch (e) {
      notify("Search failed: " + e.message, "error");
    } finally {
      setIsSearching(false);
    }
  };

  const applyResult = (res) => {
    setFormData(prev => ({
      title: res.title || '',
      artist: res.artist || '',
      album: res.album || '',
      album_artist: res.album_artist || res.artist || '',
      ...(res.cover_url ? { cover_url: res.cover_url } : {})
    }));
    notify("Template applied from " + res.source);
  };

  const handleImageFile = (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      setFormData(prev => ({ ...prev, cover_url: e.target.result }));
    };
    reader.readAsDataURL(file);
  };

  const onDragEnter = (e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); };
  const onDragOver = (e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); };
  const onDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); };
  const onDrop = (e) => {
    e.preventDefault(); 
    e.stopPropagation(); 
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleImageFile(e.dataTransfer.files[0]);
    } else {
      // Fallback for dragging an image directly from another browser tab
      const html = e.dataTransfer.getData('text/html');
      if (html) {
        const match = html.match(/src="([^"]+)"/);
        if (match && match[1]) {
          setFormData(prev => ({ ...prev, cover_url: match[1] }));
          return;
        }
      }
      const uri = e.dataTransfer.getData('text/uri-list');
      if (uri) {
        setFormData(prev => ({ ...prev, cover_url: uri }));
      }
    }
  };

  const onFileSelect = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleImageFile(e.target.files[0]);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm("Delete file?")) {
      try {
        await api.deleteSong(id);
        notify("File deleted successfully");
        onUpdate();
      } catch (e) { 
        notify("Delete failed: " + e.message, "error");
      }
    }
  };

  return (
    <div style={{ background: 'var(--surface2)', padding: 16, borderRadius: 8 }}>
      {displaySongs.length === 0 && <div style={{ color: 'var(--text-dim)' }}>{t('tagging.no_songs')}</div>}
      
      {displaySongs.length > 0 && (
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          {displaySongs.some(s => s.pending_confirmation) && (
             <button onClick={() => api.confirmTags(displaySongs.filter(s => s.pending_confirmation).map(s => s.id)).then(() => { notify("All drafted tags confirmed!"); onUpdate(); })} style={{...saveBtnStyle, background: 'var(--accent)'}}>
               {t('tagging.confirm_all')}
             </button>
          )}
          <button onClick={handleAutoTagAll} disabled={isAutoTagging} style={saveBtnStyle}>
            {isAutoTagging ? t('tagging.auto_tagging') : t('tagging.auto_tag_all')}
          </button>
        </div>
      )}

      {displaySongs.map(s => {
        const pls = playlistMap[s.filename.toLowerCase()] || [];
        return (
          <div key={s.id} style={{ 
            marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid #333',
            background: (pls.length > 0) ? 'rgba(155,81,224,0.05)' : (s.pending_confirmation ? 'rgba(76,175,80,0.05)' : 'transparent'),
            padding: (pls.length > 0 || s.pending_confirmation) ? '10px' : '0px',
            borderRadius: 4
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontWeight: 600 }}>
                {s.filename}
                {s.pending_confirmation && <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--green)', border: '1px solid var(--green)', padding: '2px 4px', borderRadius: 4 }}>{t('tagging.draft_ready')}</span>}
              </div>
              {pls.length > 0 && (
                <div style={{ background: 'var(--accent)', color: '#fff', fontSize: 10, padding: '2px 8px', borderRadius: 4, fontWeight: 800 }}>
                  {t('tagging.protected_in')} {pls.join(', ')}
                </div>
              )}
            </div>
            
            {(editingId === s.id || s.pending_confirmation) ? (
              <div style={{ display: 'flex', gap: 20 }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <input value={editingId === s.id ? formData.title : s.title} onChange={e => editingId === s.id ? setFormData({...formData, title: e.target.value}) : null} placeholder={t('tagging.title')} style={{...inputStyle, width: '100%', boxSizing: 'border-box'}} disabled={editingId !== s.id} />
                    {s.pending_confirmation && s.original_tags?.title && <div style={{ fontSize: 10, color: '#ff9800', marginTop: 4 }}>{t('tagging.original')} {s.original_tags.title}</div>}
                  </div>
                  <div>
                    <input value={editingId === s.id ? formData.artist : s.artist} onChange={e => editingId === s.id ? setFormData({...formData, artist: e.target.value}) : null} placeholder={t('tagging.artist')} style={{...inputStyle, width: '100%', boxSizing: 'border-box'}} disabled={editingId !== s.id} />
                    {s.pending_confirmation && s.original_tags?.artist && <div style={{ fontSize: 10, color: '#ff9800', marginTop: 4 }}>{t('tagging.original')} {s.original_tags.artist}</div>}
                  </div>
                  <div>
                    <input value={editingId === s.id ? formData.album : s.album} onChange={e => editingId === s.id ? setFormData({...formData, album: e.target.value}) : null} placeholder={t('tagging.album')} style={{...inputStyle, width: '100%', boxSizing: 'border-box'}} disabled={editingId !== s.id} />
                    {s.pending_confirmation && s.original_tags?.album && <div style={{ fontSize: 10, color: '#ff9800', marginTop: 4 }}>{t('tagging.original')} {s.original_tags.album}</div>}
                  </div>
                  <div>
                    <input value={editingId === s.id ? formData.album_artist : s.album_artist} onChange={e => editingId === s.id ? setFormData({...formData, album_artist: e.target.value}) : null} placeholder={t('tagging.album_artist')} style={{...inputStyle, width: '100%', boxSizing: 'border-box'}} disabled={editingId !== s.id} />
                    {s.pending_confirmation && s.original_tags?.album_artist && <div style={{ fontSize: 10, color: '#ff9800', marginTop: 4 }}>{t('tagging.original')} {s.original_tags.album_artist}</div>}
                  </div>
                  
                  <div style={{ display: 'flex', gap: 16 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 4, textTransform: 'uppercase' }}>{t('tagging.current_cover')}</div>
                      <div style={{ width: 100, height: 100, background: 'var(--surface)', borderRadius: 4, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <img 
                          src={`/api/songs/${s.id}/cover/?t=${Date.now()}`} 
                          alt="Current Cover" 
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          onError={(e) => { e.target.style.display='none'; e.target.parentElement.innerHTML=`<span style="color:#555;font-size:10px;">${t('tagging.no_cover')}</span>`; }}
                        />
                      </div>
                    </div>

                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 4, textTransform: 'uppercase' }}>{t('tagging.new_cover')} {editingId === s.id ? t('tagging.click_to_change') : ''}</div>
                      <div 
                        onDragEnter={editingId === s.id ? onDragEnter : undefined}
                        onDragOver={editingId === s.id ? onDragOver : undefined} 
                        onDragLeave={editingId === s.id ? onDragLeave : undefined} 
                        onDrop={editingId === s.id ? onDrop : undefined} 
                        onClick={() => { if (editingId === s.id) fileInputRef.current?.click(); }}
                        style={{ width: 100, height: 100, ...dropzoneStyle, borderColor: (isDragging && editingId === s.id) ? 'var(--accent)' : 'var(--border)', background: (isDragging && editingId === s.id) ? 'rgba(255,255,255,0.05)' : 'var(--surface)', padding: 0, overflow: 'hidden', justifyContent: 'center', cursor: editingId === s.id ? 'pointer' : 'default' }}>
                        
                        {editingId === s.id && <input type="file" accept="image/*" ref={fileInputRef} style={{ display: 'none' }} onChange={onFileSelect} />}
                        
                        {(editingId === s.id && formData.cover_url) ? (
                            <img src={formData.cover_url} alt="New Preview" style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }} />
                        ) : (
                          <div style={{ color: 'var(--text-dim)', fontSize: 10, textAlign: 'center', padding: 10, pointerEvents: 'none' }}>{t('tagging.use_current')}</div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    {editingId === s.id ? (
                      <>
                        <button onClick={() => save(s.id)} style={{...saveBtnStyle, flex: 1}}>{t('tagging.save_tags')}</button>
                        <button onClick={() => handleRevert(s.id)} style={{ ...saveBtnStyle, background: 'transparent', color: '#ff9800', border: '1px solid #ff9800' }}>{t('tagging.use_original')}</button>
                        <button onClick={() => {setEditingId(null); if (s.pending_confirmation) handleReject(s.id);}} style={{ ...saveBtnStyle, background: 'var(--surface)', color: '#fff', border: '1px solid #555' }}>{t('tagging.cancel')}</button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => handleConfirm(s.id)} style={{...saveBtnStyle, flex: 1, background: 'var(--accent)'}}>{t('tagging.confirm_draft')}</button>
                        <button onClick={() => startEdit(s)} style={{ ...saveBtnStyle, background: 'transparent', color: 'var(--accent)', border: '1px solid var(--accent)' }}>{t('tagging.edit_draft')}</button>
                        <button onClick={() => handleReject(s.id)} style={{ ...saveBtnStyle, background: 'transparent', color: '#ff4d4d', border: '1px solid #ff4d4d' }}>{t('tagging.reject')}</button>
                        <button onClick={() => handleRevert(s.id)} style={{ ...saveBtnStyle, background: 'transparent', color: '#ff9800', border: '1px solid #ff9800' }}>{t('tagging.use_original')}</button>
                      </>
                    )}
                  </div>

                </div>

                {editingId === s.id && (
                  <div style={{ flex: 1, borderLeft: '1px solid #333', paddingLeft: 20 }}>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                      <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && performSearch()} placeholder={t('tagging.search')} style={{ ...inputStyle, flex: 1 }} />
                      <button onClick={performSearch} disabled={isSearching} style={saveBtnStyle}>{isSearching ? '...' : t('tagging.search')}</button>
                    </div>
                    {searchResults.map((res, i) => (
                      <div key={i} style={{ display: 'flex', gap: 12, padding: 8, background: 'var(--surface)', borderRadius: 4, cursor: 'pointer', marginBottom: 4 }} onClick={() => applyResult(res)}>
                        {res.cover_url && <img src={res.cover_url} alt="cover" style={{ width: 30, height: 30, borderRadius: 4 }} />}
                        <div style={{ flex: 1, fontSize: 11 }}>
                           <div style={{ fontWeight: 600 }}>{res.title}</div>
                           <div style={{ color: 'var(--text-dim)' }}>{res.artist}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => startEdit(s)} style={editBtnStyle}>{t('tagging.edit_metadata')}</button>
                <button onClick={() => handleDelete(s.id)} style={{ ...editBtnStyle, color: '#ff4d4d', borderColor: '#ff4d4d' }}>{t('tagging.delete')}</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
