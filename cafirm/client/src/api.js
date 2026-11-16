const BASE = import.meta.env.VITE_API_URL || '';
export const getToken = () => { try { return localStorage.getItem('token'); } catch { return null; } };
export const setToken = (t) => { try { t ? localStorage.setItem('token', t) : localStorage.removeItem('token'); } catch { /* private mode */ } };

async function request(method, url, body) {
  const form = body instanceof FormData;
  let res;
  try {
    res = await fetch(BASE + '/api' + url, {
      method,
      headers: { ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}), ...(body && !form ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? (form ? body : JSON.stringify(body)) : undefined,
    });
  } catch { throw new Error('Cannot reach the server. Check your internet connection.'); }
  if (res.status === 401 && getToken() && !url.startsWith('/auth/login')) { setToken(null); window.dispatchEvent(new Event('auth-expired')); }
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  get: (u) => request('GET', u),
  post: (u, b) => request('POST', u, b ?? {}),
  put: (u, b) => request('PUT', u, b ?? {}),
  patch: (u, b) => request('PATCH', u, b ?? {}),
  del: (u, b) => request('DELETE', u, b),
  /** Downloads need the login token, so fetch them as a blob and hand the browser a temporary link. */
  async download(doc) {
    const res = await fetch(`${BASE}/api/documents/${doc.id}/download`, { headers: { Authorization: `Bearer ${getToken()}` } });
    if (!res.ok) throw new Error('Could not download the file');
    const url = URL.createObjectURL(await res.blob());
    const a = Object.assign(document.createElement('a'), { href: url, download: doc.original_name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  },
};
