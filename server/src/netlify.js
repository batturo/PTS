/**
 * Netlify Function entry point: runs the same Express app serverlessly.
 * The SQLite database (sql.js) is kept in Netlify Blobs: loaded when a function instance starts or when another
 * instance has saved a newer copy, and saved again after every request that changed data. Uploads are stored there too.
 */
import fs from 'node:fs';
import path from 'node:path';
import serverless from 'serverless-http';
import { connectLambda, getStore } from '@netlify/blobs';
import { WASM_BASE64 } from './sqlwasm.generated.js';

process.env.SERVERLESS ||= '1';

let storeFactory = (event) => { connectLambda(event); return getStore({ name: 'school-erp', consistency: 'strong' }); };
/** For local testing: replace Netlify Blobs with another store implementing get/set/getMetadata. */
export const setStoreFactory = (f) => { storeFactory = f; };

const TYPES = { '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.ppt': 'application/vnd.ms-powerpoint', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation' };

let m, driver, etag, run, store;
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
  await store.set('db', driver.export());
  etag = (await store.getMetadata('db'))?.etag;
  driver.clean();
}

async function loadDatabase() {
  const meta = await store.getMetadata('db');
  if (driver && meta && meta.etag === etag) return; // our copy is current
  const buf = meta ? await store.get('db', { type: 'arrayBuffer' }) : null;
  driver = await m.openSqlJs(buf ? new Uint8Array(buf) : null, wasm);
  m.useDatabase(driver);
  etag = meta?.etag;
  if (m.isEmpty()) m.seedDemo(); // first visit ever: create the demo school
  if (driver.dirty) await save();
}

export const handler = async (event, context) => {
  store = storeFactory(event);
  await modules();
  await loadDatabase();
  // Requests arrive as /.netlify/functions/api/<original path> (see netlify.toml); restore the original path.
  event.path = (event.path || '/').replace(/^\/\.netlify\/functions\/api/, '') || '/';
  const res = await run(event, context);
  if (driver.dirty) await save();
  return res;
};
