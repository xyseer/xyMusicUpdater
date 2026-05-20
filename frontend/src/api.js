import axios from 'axios';

const instance = axios.create({
  baseURL: '/api',
});

export const api = {
  getStatus: () => instance.get('/status/').then(r => r.data),
  getSongs: () => instance.get('/songs/').then(r => r.data),
  getPlaylistMap: () => instance.get('/songs/playlist-map/').then(r => r.data),
  getJobs: () => instance.get('/jobs/').then(r => r.data),
  getPermanentLog: () => instance.get('/permanent-log/').then(r => r.data),
  manualDownload: (url, allow_playlist = false) => instance.post('/jobs/manual/', { url, allow_playlist }).then(r => r.data),
  triggerCron: () => instance.post('/jobs/cron/').then(r => r.data),
  triggerRescan: () => instance.post('/rescan/').then(r => r.data),
  triggerPurge: () => instance.post('/purge/').then(r => r.data),
  getPlaylists: () => instance.get('/playlists/').then(r => r.data),
  getConfig: () => instance.get('/config/').then(r => r.data),
  updateConfig: (data) => instance.post('/config/update/', data).then(r => r.data),
  getSubscriptions: () => instance.get('/subscriptions/').then(r => r.data),
  addSubscription: (data) => instance.post('/subscriptions/', data).then(r => r.data),
  updateSubscription: (id, data) => instance.patch(`/subscriptions/${id}/`, data).then(r => r.data),
  deleteSubscription: (id) => instance.delete(`/subscriptions/${id}/`).then(r => r.data),
  runSubscriptions: () => instance.post('/subscriptions/run/').then(r => r.data),
  updateSong: (id, data) => instance.patch(`/songs/${id}/`, data).then(r => r.data),
  deleteSong: (id) => instance.delete(`/songs/${id}/`).then(r => r.data),
  getUpcomingPurges: () => instance.get('/purge/upcoming/').then(r => r.data),
  searchMusicBrainz: (q) => instance.get('/musicbrainz/search/', { params: { q } }).then(r => r.data),
  autoTagAll: () => instance.post('/songs/auto-tag-all/').then(r => r.data),
  confirmTags: (ids) => instance.post('/songs/confirm-tags/', { ids }).then(r => r.data),
  rejectTags: (ids) => instance.post('/songs/reject-tags/', { ids }).then(r => r.data),
  revertSong: (id) => instance.post(`/songs/${id}/revert/`).then(r => r.data),
  cleanupHistory: (days) => instance.post('/songs/cleanup-history/', { days }).then(r => r.data),
  getSchedulerInfo: () => instance.get('/scheduler/').then(r => r.data),
  triggerSchedulerTask: (task_id) => instance.post('/scheduler/trigger/', { task_id }).then(r => r.data),
};
