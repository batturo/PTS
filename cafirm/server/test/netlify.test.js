// Runs the bundled Netlify Function (netlify/build/api.bundle.mjs) against an in-memory stand-in for Netlify Blobs.
// Requires `npm run build:function` first.
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.ADMIN_PASSWORD = 'admin-pass-1';
process.env.JWT_SECRET = 'test-secret';
const fn = await import('../../netlify/build/api.bundle.mjs');

// Minimal Blobs: get / set (with onlyIfNew / onlyIfMatch) / delete / getMetadata / getWithMetadata, with etags.
function fakeBlobs() {
  const data = new Map(); let n = 0;
  const s = {
    data, beforeSet: null,
    async get(k, o) { const e = data.get(k); if (!e) return null; return o?.type === 'arrayBuffer' ? e.bytes.slice(0).buffer : Buffer.from(e.bytes).toString(); },
    async getMetadata(k) { const e = data.get(k); return e ? { etag: e.etag, metadata: {} } : null; },
    async getWithMetadata(k, o) { const e = data.get(k); return e ? { data: await s.get(k, o), etag: e.etag, metadata: {} } : null; },
    async set(k, v, o = {}) {
      s.beforeSet?.(k); const e = data.get(k);
      if (o.onlyIfNew && e) return { modified: false };
      if (o.onlyIfMatch && (!e || e.etag !== o.onlyIfMatch)) return { modified: false };
      const bytes = v instanceof ArrayBuffer ? new Uint8Array(v) : ArrayBuffer.isView(v) ? new Uint8Array(v.buffer, v.byteOffset, v.byteLength) : Buffer.from(String(v));
      const etag = `"e${++n}"`; data.set(k, { bytes: Uint8Array.from(bytes), etag }); return { modified: true, etag };
    },
    async delete(k) { data.delete(k); },
  };
  return s;
}
const blobs = fakeBlobs();
fn.setStoreFactory(() => blobs);

async function call(method, path, { token, body, form } = {}) {
  let headers = { ...(token ? { authorization: `Bearer ${token}` } : {}) }, raw = null;
  if (form) { const r = new Response(form); headers['content-type'] = r.headers.get('content-type'); raw = Buffer.from(await r.arrayBuffer()); }
  else if (body) { headers['content-type'] = 'application/json'; raw = Buffer.from(JSON.stringify(body)); }
  const res = await fn.default(new Request(`https://site.test${path}`, { method, headers, body: raw }), {});
  const ct = res.headers.get('content-type') || '';
  return { status: res.status, data: ct.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer()).toString() };
}
const S = {};

test('first request bootstraps the database, master data and admin login in Blobs', async () => {
  assert.equal((await call('GET', '/api/health')).status, 200);
  const r = await call('POST', '/api/auth/login', { body: { username: 'admin', password: 'admin-pass-1' } });
  assert.equal(r.status, 200); S.admin = r.data.token;
  assert.ok(blobs.data.has('db'));
  assert.equal((await call('GET', '/api/templates', { token: S.admin })).data.length, 21);
});

test('data written in one request is there in the next, and the demo is not created', async () => {
  const c = await call('POST', '/api/clients', { token: S.admin, body: { name: 'Blob Co', entity_type: 'pvt_ltd', gstin: '29ABCDE1234F1Z5', login: { username: 'blob', password: 'password1' } } });
  assert.equal(c.status, 201); S.client = c.data.id;
  const login = await call('POST', '/api/auth/login', { body: { username: 'blob', password: 'password1' } });
  S.cust = login.data.token;
  assert.ok((await call('GET', '/api/filings', { token: S.cust })).data.length > 20);
  assert.equal((await call('GET', '/api/clients', { token: S.admin })).data.length, 1);
});

test('uploaded documents are stored in Blobs and only served to the right people', async () => {
  const form = new FormData(); form.set('client_id', S.client); form.set('title', 'Report'); form.set('file', new Blob(['hello blobs'], { type: 'text/plain' }), 'r.txt');
  const up = await call('POST', '/api/documents', { token: S.admin, form });
  assert.equal(up.status, 201);
  assert.ok([...blobs.data.keys()].some((k) => k.startsWith('files/')));
  assert.equal((await call('GET', `/api/documents/${up.data.id}/download`, { token: S.cust })).data, 'hello blobs');
  assert.equal((await call('GET', `/api/documents/${up.data.id}/download`)).status, 401);
  const big = new FormData(); big.set('client_id', S.client); big.set('file', new Blob([Buffer.alloc(5 * 1024 * 1024)]), 'big.pdf');
  assert.equal((await call('POST', '/api/documents', { token: S.admin, form: big })).status, 400); // over the 4 MB limit
});

test('a request that loses a simultaneous save is rejected with 409, not silently lost', async () => {
  // Another instance saves between our load and our save.
  let fired = false;
  blobs.beforeSet = (k) => { if (k === 'db' && !fired) { fired = true; const e = blobs.data.get('db'); blobs.data.set('db', { ...e, etag: '"other-instance"' }); } };
  const r = await call('POST', '/api/clients', { token: S.admin, body: { name: 'Racer', entity_type: 'individual' } });
  blobs.beforeSet = null;
  assert.equal(r.status, 409);
  // The system recovers: the next request reloads and works.
  assert.equal((await call('POST', '/api/clients', { token: S.admin, body: { name: 'Racer', entity_type: 'individual' } })).status, 201);
  assert.equal((await call('GET', '/api/clients', { token: S.admin })).data.filter((c) => c.name === 'Racer').length, 1);
});
