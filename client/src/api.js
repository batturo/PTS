export const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
export const fileUrl = (u) => (!u ? '' : /^https?:/.test(u) ? u : API_BASE + u);

let token = localStorage.getItem('erp_token');
export const setToken = (t) => { token = t; t ? localStorage.setItem('erp_token', t) : localStorage.removeItem('erp_token'); };
export const getToken = () => token;

export async function api(path, { method = 'GET', body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetch(`${API_BASE}/api${path}`, { method, headers, body: form || (body !== undefined ? JSON.stringify(body) : undefined) });
  } catch { throw new Error('Cannot reach the server. Check your internet connection.'); }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token) { setToken(null); window.dispatchEvent(new Event('erp-logout')); }
  if (!res.ok) {
    if (data.error) throw new Error(data.error);
    if (res.status === 404) throw new Error('The website cannot reach its server (404). On Netlify, open Deploys and check that the latest deploy finished and lists the "api" function; then Trigger deploy → Clear cache and deploy site.');
    if ([502, 503, 504].includes(res.status)) throw new Error('The server is busy or starting up. Please wait a few seconds and try again.');
    throw new Error(`Request failed (${res.status})`);
  }
  return data;
}
export const get = (p) => api(p);
export const post = (p, body) => api(p, { method: 'POST', body: body ?? {} });
export const put = (p, body) => api(p, { method: 'PUT', body });
export const del = (p, body) => api(p, { method: 'DELETE', body });
export async function uploadFile(file) {
  const form = new FormData(); form.append('file', file);
  return api('/upload', { method: 'POST', form });
}
export const qs = (o) => { const s = new URLSearchParams(Object.entries(o).filter(([, v]) => v !== '' && v != null)).toString(); return s ? `?${s}` : ''; };
