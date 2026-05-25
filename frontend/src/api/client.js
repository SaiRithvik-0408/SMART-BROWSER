import axios from 'axios';

// When loaded from file:// (Electron production), `/api` would resolve to
// file:///api/... and fail. Detect that and point straight at the backend.
const isFile = typeof window !== 'undefined' && window.location.protocol === 'file:';
const BACKEND = isFile ? 'http://localhost:8080' : '';

const api = axios.create({ baseURL: `${BACKEND}/api` });

export const proxyUrlFor = (raw) => {
  if (!raw) return '';
  const normalized = raw.startsWith('http') ? raw : `https://${raw}`;
  return `${BACKEND}/api/proxy?url=${encodeURIComponent(normalized)}`;
};

export const VpnApi = {
  status:     () => api.get('/vpn/status').then(r => r.data),
  servers:    () => api.get('/vpn/servers').then(r => r.data),
  check:      () => api.get('/vpn/check').then(r => r.data),
  connect:    (serverId) => api.post('/vpn/connect', { serverId }).then(r => r.data),
  disconnect: () => api.post('/vpn/disconnect').then(r => r.data),
};

export default api;
