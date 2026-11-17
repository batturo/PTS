/**
 * Netlify Function entry point (Functions API v2): runs the same Express app serverlessly.
 * The SQLite database (sql.js) is kept in Netlify Blobs: loaded when a function instance starts or when another
 * instance has saved a newer copy, and saved again after every request that changed data. Uploads are stored there too.
 * Every save carries an increasing version number, so a delayed (stale) read can never replace newer data.
 */
import fs from 'node:fs';
import path from 'node:path';
import serverless from 'serverless-http';
import { getStore } from '@netlify/blobs';
import { WASM_BASE64 } from './sqlwasm.generated.js';

process.env.SERVERLESS ||= '1';

const STORE = 'school-erp';
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
  getMetadata: (...a) => resilient.call('getMetadata', ...a),
};
let storeFactory = () => resilient;
/** For local testing: replace Netlify Blobs with another store implementing get/set/getMetadata. */
export const setStoreFactory = (f) => { storeFactory = f; };

const TYPES = { '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.ppt': 'application/vnd.ms-powerpoint', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation' };

let m, driver, version = -1, run, store;
const wasm = Buffer.from(WASM_BASE64, 'base64');

async function modules() {
  if (m) return m;
  const [dbm, sqljs, demo, appm, misc] = await Promise.all([import('./db.js'), import('./sqljs.js'), import('./demo.js'), import('./app.js'), import('./routes/misc.js')]);
  m = { ...dbm, ...sqljs, ...demo, ...appm, ...misc };
  misc.setUploadHook(async (file) => {
    await store.set(`uploads/${file.filename}`, fs.readFileSync(file.path));
    fs.rmSync(file.path, { force: true });
  });
  const app = m.createApp({
    loadUpload: async (name) => {
      const body = await store.get(`uploads/${path.basename(name)}`, { type: 'arrayBuffer' });
      return body ? { body: Buffer.from(body), contentType: TYPES[path.extname(name).toLowerCase()] } : null;
    },
  });
  run = serverless(app, {
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

async function save() {
  version += 1;
  await store.set('db', driver.export(), { metadata: { version } });
  driver.clean();
}

async function loadDatabase() {
  const meta = await store.getMetadata('db');
  const remote = meta ? Number(meta.metadata?.version ?? 0) : -1;
  if (driver && remote <= version) return; // our copy is as new as the stored one
  const buf = meta ? await store.get('db', { type: 'arrayBuffer' }) : null;
  driver = await m.openSqlJs(buf ? new Uint8Array(buf) : null, wasm);
  m.useDatabase(driver);
  version = Math.max(remote, 0);
  if (m.isEmpty()) m.seedDemo(); // first visit ever: create the demo school
  else m.upgradeDemo();
  if (driver.dirty) await save();
}

/** Handles one request in the Lambda-style event format (also used by the local test harness). */
export const handler = async (event, context) => {
  store = storeFactory(event);
  await modules();
  await loadDatabase();
  event.path = (event.path || '/').replace(/^\/\.netlify\/functions\/api/, '') || '/';
  const res = await run(event, context);
  if (driver.dirty) await save();
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
    console.error('School ERP function error:', e);
    return Response.json({ error: `Server error: ${e?.message || e}` }, { status: 500 });
  }
}
