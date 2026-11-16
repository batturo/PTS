import fs from 'node:fs';
import path from 'node:path';
import { UPLOAD_DIR } from './db.js';

/** Where uploaded documents live. Default: a folder on disk. The Netlify Function swaps in Netlify Blobs (setFileStore). */
let store = {
  async save(name, buf) { fs.mkdirSync(UPLOAD_DIR, { recursive: true }); fs.writeFileSync(path.join(UPLOAD_DIR, path.basename(name)), buf); },
  async read(name) { const p = path.join(UPLOAD_DIR, path.basename(name)); return fs.existsSync(p) ? fs.readFileSync(p) : null; },
  async remove(name) { fs.rmSync(path.join(UPLOAD_DIR, path.basename(name)), { force: true }); },
};
export const setFileStore = (s) => { store = s; };
export const files = { save: (...a) => store.save(...a), read: (...a) => store.read(...a), remove: (...a) => store.remove(...a) };
