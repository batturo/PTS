/**
 * Netlify Function entry point (Functions API v2): runs the same Express app serverlessly.
 *  - The SQLite database (sql.js, in memory) is stored as one blob. It is reloaded whenever another function instance
 *    has saved a newer copy, and saved after every request that changed data.
 *  - Saves are CONDITIONAL (onlyIfMatch the version we loaded): if two people save at the same moment, the second one gets
 *    HTTP 409 "please try again" instead of silently overwriting the first person's change.
 *  - Uploaded documents are stored as separate blobs and are only reachable through the authorised download endpoint.
 */
import serverless from 'serverless-http';
import { getStore } from '@netlify/blobs';
import { WASM_BASE64 } from './sqlwasm.generated.js';

process.env.SERVERLESS ||= '1';

const STORE = 'cafirm';
let storeMode = 'strong';
// Strong consistency needs Netlify's uncached Blobs endpoint; if the environment lacks it, fall back to the default.
const blobs = () => getStore(storeMode === 'strong' ? { name: STORE, consistency: 'strong' } : { name: STORE });
const resilient = {
  async call(op, ...args) {
    try { return await blobs()[op](...args); }
    catch (e) {
      if (storeMode === 'strong' && e?.name === 'BlobsConsistencyError') { storeMode = 'eventual'; return blobs()[op](...args); }
      throw e;
    }
  },
  get: (...a) => resilient.call('get', ...a),
  set: (...a) => resilient.call('set', ...a),
  delete: (...a) => resilient.call('delete', ...a),
  getMetadata: (...a) => resilient.call('getMetadata', ...a),
  getWithMetadata: (...a) => resilient.call('getWithMetadata', ...a),
};
let storeFactory = () => resilient;
/** For local testing: replace Netlify Blobs with another store implementing get/set/delete/getMetadata/getWithMetadata. */
export const setStoreFactory = (f) => { storeFactory = f; };

let m, driver, etag = null, run, store;
const wasm = Buffer.from(WASM_BASE64, 'base64');

async function modules() {
  if (m) return m;
  const [dbm, sqljs, appm, boot, comp, filesm] = await Promise.all([import('./db.js'), import('./sqljs.js'), import('./app.js'), import('./bootstrap.js'), import('./compliance.js'), import('./files.js')]);
  m = { ...dbm, ...sqljs, ...appm, ...boot, ...comp };
  filesm.setFileStore({
    save: (name, buf) => store.set(`files/${name}`, buf),
    read: async (name) => { const b = await store.get(`files/${name}`, { type: 'arrayBuffer' }); return b ? Buffer.from(b) : null; },
    remove: (name) => store.delete(`files/${name}`),
  });
  run = serverless(m.createApp(), {
    binary: (headers) => !/^(application\/json|text\/|application\/javascript)/.test(String(headers['content-type'] || '')),
    // serverless-http hands Express the raw body as a Buffer, which Express 5's JSON parser then skips; parse it here.
    request: (req) => {
      if (!Buffer.isBuffer(req.body)) return;
      if (/application\/json/.test(req.headers['content-type'] || '')) {
        try { req.body = req.body.length ? JSON.parse(req.body.toString('utf8')) : {}; } catch { req.body = {}; }
      } else if (!/multipart\/form-data/.test(req.headers['content-type'] || '')) req.body = undefined;
    },
  });
  return m;
}

class Conflict extends Error {}

async function save() {
  const bytes = driver.export();
  const r = await store.set('db', bytes, etag ? { onlyIfMatch: etag } : { onlyIfNew: true });
  if (!r.modified) { driver = null; etag = null; throw new Conflict(); } // someone else saved first: reload on the next request
  etag = r.etag ?? null; // if unknown, the next request re-reads the stored copy
  driver.clean();
}

async function loadDatabase() {
  const meta = await store.getMetadata('db');
  if (driver && meta && etag && meta.etag === etag) return; // our copy is the stored copy
  const entry = meta ? await store.getWithMetadata('db', { type: 'arrayBuffer' }) : null;
  driver = await m.openSqlJs(entry ? new Uint8Array(entry.data) : null, wasm);
  etag = entry?.etag ?? null;
  m.useDatabase(driver);
  if (entry) driver.clean(); // migrate() only re-asserts tables that already exist
  m.bootstrap(); // first run only: master lists + the first Administrator login
  m.generateFilings({ fy: m.currentFY() });
  if (driver.dirty) await save();
}

const json = (statusCode, body) => ({ statusCode, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

/** Handles one request in the Lambda-style event format (also used by the local test harness). */
export const handler = async (event, context) => {
  store = storeFactory(event);
  await modules();
  for (let attempt = 0; ; attempt++) {
    try { await loadDatabase(); break; } catch (e) { if (!(e instanceof Conflict) || attempt > 2) throw e; }
  }
  event.path = (event.path || '/').replace(/^\/\.netlify\/functions\/api/, '') || '/';
  const res = await run(event, context);
  if (driver.dirty) {
    try { await save(); } catch (e) {
      if (!(e instanceof Conflict)) throw e;
      // Reads (e.g. a download's log entry) are still answered; a write that could not be saved must not look successful.
      if (event.httpMethod === 'GET') return res;
      return json(409, { error: 'Someone else saved a change at the same moment. Nothing was lost – please try again.' });
    }
  }
  return res;
};

/** Netlify Functions v2 entry: converts the web Request to an event, and the result back to a Response. */
export default async function netlifyFunction(req, context) {
  try {
    const url = new URL(req.url);
    const body = Buffer.from(await req.arrayBuffer());
    const multi = {};
    for (const k of url.searchParams.keys()) multi[k] = url.searchParams.getAll(k);
    const r = await handler({
      path: url.pathname, httpMethod: req.method, headers: Object.fromEntries(req.headers),
      queryStringParameters: Object.fromEntries(url.searchParams), multiValueQueryStringParameters: multi,
      body: body.length ? body.toString('base64') : null, isBase64Encoded: body.length > 0,
    }, context);
    const headers = new Headers();
    for (const [k, v] of Object.entries(r.headers || {})) headers.set(k, String(v));
    for (const [k, vs] of Object.entries(r.multiValueHeaders || {})) for (const v of [].concat(vs)) headers.append(k, String(v));
    const out = r.body ? Buffer.from(r.body, r.isBase64Encoded ? 'base64' : 'utf8') : null;
    return new Response([204, 304].includes(r.statusCode) ? null : out, { status: r.statusCode, headers });
  } catch (e) {
    console.error('CA portal function error:', e);
    return Response.json({ error: 'Server error. Please try again.' }, { status: 500 });
  }
}
