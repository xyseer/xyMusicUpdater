import axios from 'axios';

const instance = axios.create({
  baseURL: '/api',
  withCredentials: true,
  timeout: 15000
});

// Helper to grab CSRF token from cookies
function getCookie(name) {
  let cookieValue = null;
  if (document.cookie && document.cookie !== '') {
      const cookies = document.cookie.split(';');
      for (let i = 0; i < cookies.length; i++) {
          const cookie = cookies[i].trim();
          if (cookie.substring(0, name.length + 1) === (name + '=')) {
              cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
              break;
          }
      }
  }
  return cookieValue;
}

instance.interceptors.request.use(config => {
  const csrfToken = getCookie('csrftoken');
  if (csrfToken) {
      config.headers['X-CSRFToken'] = csrfToken;
  }
  return config;
});


instance.interceptors.response.use(
  response => response,
  error => {
    if (error.response && error.response.status === 401) {
      // Trigger a global event for App.jsx to handle
      window.dispatchEvent(new CustomEvent('api-unauthorized'));
    }
    return Promise.reject(error);
  }
);

export const api = {
  login: (username, password) => instance.post('/auth/login/', { username, password }).then(r => r.data),
  logout: () => instance.post('/auth/logout/').then(r => r.data),
  getSession: () => instance.get('/auth/session/').then(r => r.data),
  getStatus: () => instance.get('/status/').then(r => r.data),
  getSongs: () => instance.get('/songs/').then(r => r.data),
  getPlaylistMap: () => instance.get('/songs/playlist-map/').then(r => r.data),
  getJobs: () => instance.get('/jobs/').then(r => r.data),
  getPermanentLog: () => instance.get('/permanent-log/').then(r => r.data),
  manualDownload: (url, allow_playlist = false, override_duplicate = false) => instance.post('/jobs/manual/', { url, allow_playlist, override_duplicate }).then(r => r.data),
  triggerCron: () => instance.post('/jobs/cron/').then(r => r.data),
  triggerRescan: () => instance.post('/rescan/').then(r => r.data),
  triggerPurge: () => instance.post('/purge/').then(r => r.data),
  getPlaylists: () => instance.get('/playlists/').then(r => r.data),
  getConfig: () => instance.get('/config/').then(r => r.data),
  updateConfig: (data) => instance.post('/config/update/', data).then(r => r.data),
  uploadBackground: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return instance.post('/config/background/upload/', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }).then(r => r.data);
  },
  getSubscriptions: () => instance.get('/subscriptions/').then(r => r.data),
  addSubscription: (data) => instance.post('/subscriptions/', data).then(r => r.data),
  updateSubscription: (id, data) => instance.patch(`/subscriptions/${id}/`, data).then(r => r.data),
  deleteSubscription: (id) => instance.delete(`/subscriptions/${id}/`).then(r => r.data),
  runSubscriptions: () => instance.post('/subscriptions/run/').then(r => r.data),
  updateSong: (id, data) => instance.patch(`/songs/${id}/`, data).then(r => r.data),
  deleteSong: (id) => instance.delete(`/songs/${id}/`).then(r => r.data),
  getUpcomingPurges: () => instance.get('/purge/upcoming/').then(r => r.data),
  searchMusicBrainz: (q) => instance.get('/musicbrainz/search/', { params: { q } }).then(r => r.data),
  searchMedia: (q) => instance.get('/search-media/', { params: { q } }).then(r => r.data),
  autoTagAll: () => instance.post('/songs/auto-tag-all/').then(r => r.data),
  confirmTags: (ids) => instance.post('/songs/confirm-tags/', { ids }).then(r => r.data),
  rejectTags: (ids) => instance.post('/songs/reject-tags/', { ids }).then(r => r.data),
  revertSong: (id) => instance.post(`/songs/${id}/revert/`).then(r => r.data),
  cleanupHistory: (days) => instance.post('/songs/cleanup-history/', { days }).then(r => r.data),
  getSchedulerInfo: () => instance.get('/scheduler/').then(r => r.data),
  triggerSchedulerTask: (task_id) => instance.post('/scheduler/trigger/', { task_id }).then(r => r.data),
  getCompilationCandidates: () => instance.get('/compilation/candidates/').then(r => r.data),
  mergeCompilation: (ids) => instance.post('/compilation/merge/', { ids }).then(r => r.data),
  trimSong: (id, start, end) => instance.post(`/songs/${id}/trim/`, { start, end }).then(r => r.data),
  confirmTrim: (id, preview_path) => instance.post(`/songs/${id}/trim/confirm/`, { preview_path }).then(r => r.data),
  cleanupPreviews: (preview_path) => instance.post('/editor/cleanup-previews/', { preview_path }).then(r => r.data),
  setTimeout: (seconds) => {
    instance.defaults.timeout = (seconds || 15) * 1000;
  }
};
