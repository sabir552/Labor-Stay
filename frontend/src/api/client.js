import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
  withCredentials: true,
});

// Attach JWT from localStorage on every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('laborstay_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Normalize errors so components always get `{ message, status, details? }`
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err.response?.status || 0;
    const message = err.response?.data?.error || err.message || 'Network error';
    const details = err.response?.data?.details;
    // 401 → wipe token (let UI redirect)
    if (status === 401) {
      localStorage.removeItem('laborstay_token');
      localStorage.removeItem('laborstay_user');
    }
    return Promise.reject({ status, message, details, raw: err });
  }
);

// Convenience wrappers
export const get  = (url, params)         => api.get(url, { params }).then((r) => r.data);
export const post = (url, body, opts)     => api.post(url, body, opts).then((r) => r.data);
export const put  = (url, body, opts)     => api.put(url, body, opts).then((r) => r.data);
export const del  = (url, opts)           => api.delete(url, opts).then((r) => r.data);

// Multipart helper
export const upload = (url, formData) =>
  api.post(url, formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data);

// Build URL for downloads (with token in query for direct browser links)
export const downloadUrl = (path) => `${API_BASE}${path}`;

export default api;
