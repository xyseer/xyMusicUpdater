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
      window.dispatchEvent(new CustomEvent('api-unauthorized'));
    }
    return Promise.reject(error);
  }
);

export const api = {
  login: (username, password) => instance.post('/auth/login/', { username, password }).then(r => r.data),
  logout: () => instance.post('/auth/logout/').then(r => r.data),
  getSession: (signal) => instance.get('/auth/session/', { signal }).then(r => r.data),
  getStatus: (signal) => instance.get('/status/', { signal }).then(r => r.data),
  getSongs: (signal, status, page, page_size) => instance.get('/songs/', { params: { status, page, page_size }, signal }).then(r => r.data),
  getPlaylistMap: (signal) => instance.get('/songs/playlist-map/', { signal }).then(r => r.data),
  getJobs: (signal, page = 1, page_size = 20) => instance.get('/jobs/', { params: { page, page_size }, signal }).then(r => r.data),
  getPermanentLog: (signal) => instance.get('/permanent-log/', { signal }).then(r => r.data),
  manualDownload: (url, allow_playlist = false, override_duplicate = false) => instance.post('/jobs/manual/', { url, allow_playlist, override_duplicate }).then(r => r.data),
  triggerCron: () => instance.post('/jobs/cron/').then(r => r.data),
  triggerRescan: () => instance.post('/rescan/').then(r => r.data),
  triggerPurge: () => instance.post('/purge/').then(r => r.data),
  getPlaylists: (signal) => instance.get('/playlists/', { signal }).then(r => r.data),
  getConfig: (signal) => instance.get('/config/', { signal }).then(r => r.data),
  updateConfig: (data) => instance.post('/config/update/', data).then(r => r.data),
  uploadBackground: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return instance.post('/config/background/upload/', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }).then(r => r.data);
  },
  getSubscriptions: (signal) => instance.get('/subscriptions/', { signal }).then(r => r.data),
  addSubscription: (data) => instance.post('/subscriptions/', data).then(r => r.data),
  updateSubscription: (id, data) => instance.patch(`/subscriptions/${id}/`, data).then(r => r.data),
  deleteSubscription: (id) => instance.delete(`/subscriptions/${id}/`).then(r => r.data),
  runSubscriptions: () => instance.post('/subscriptions/run/').then(r => r.data),
  updateSong: (id, data) => instance.patch(`/songs/${id}/`, data).then(r => r.data),
  stageSong: (id, data) => instance.patch(`/songs/${id}/stage/`, data).then(r => r.data),
  deleteSong: (id) => instance.delete(`/songs/${id}/`).then(r => r.data),
  getUpcomingPurges: (signal, candidates_page, protected_page, page_size) => instance.get('/purge/upcoming/', { params: { candidates_page, protected_page, page_size }, signal }).then(r => r.data),
  searchMedia: (q, signal) => instance.get('/search-media/', { params: { q }, signal }).then(r => r.data),
  autoTagAll: () => instance.post('/songs/auto-tag-all/').then(r => r.data),
  confirmTags: (ids) => instance.post('/songs/confirm-tags/', { ids }).then(r => r.data),
  rejectTags: (ids) => instance.post('/songs/reject-tags/', { ids }).then(r => r.data),
  revertSong: (id) => instance.post(`/songs/${id}/revert/`).then(r => r.data),
  cleanupHistory: (days) => instance.post('/songs/cleanup-history/', { days }).then(r => r.data),
  getSchedulerInfo: (signal) => instance.get('/scheduler/', { signal }).then(r => r.data),
  triggerSchedulerTask: (task_id) => instance.post('/scheduler/trigger/', { task_id }).then(r => r.data),
  getCompilationCandidates: (signal, page, page_size) => instance.get('/compilation/candidates/', { params: { page, page_size }, signal }).then(r => r.data),
  mergeCompilation: (ids, album_artist) => instance.post('/compilation/merge/', { ids, album_artist }).then(r => r.data),
  ignoreCompilationSongs: (ids) => instance.post('/compilation/ignore/', { ids }).then(r => r.data),
  trimSong: (id, start, end) => instance.post(`/songs/${id}/trim/`, { start, end }).then(r => r.data),
  confirmTrim: (id, preview_path) => instance.post(`/songs/${id}/trim/confirm/`, { preview_path }).then(r => r.data),
  cleanupPreviews: (preview_path) => instance.post('/editor/cleanup-previews/', { preview_path }).then(r => r.data),
  uploadSongs: (files) => {
    const formData = new FormData();
    files.forEach(f => formData.append('files', f));
    return instance.post('/upload/', formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data);
  },
  getDuplicatesStatus: () => instance.get('/duplicates/status/').then(r => r.data),
  startDuplicatesScan: () => instance.post('/duplicates/scan/').then(r => r.data),
  getDuplicates: (signal, page = 1, page_size = 10) => instance.get('/duplicates/', { params: { page, page_size }, signal }).then(r => r.data),
  dismissDuplicateGroup: (group_id) => instance.post('/duplicates/dismiss/', { group_id }).then(r => r.data),
  deleteDuplicates: (nd_ids) => instance.post('/duplicates/delete/', { nd_ids }).then(r => r.data),
  setTimeout: (seconds) => {
    instance.defaults.timeout = (seconds || 15) * 1000;
  }
};
