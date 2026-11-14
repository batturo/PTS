import crypto from 'node:crypto';
export class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
export const bad = (msg) => new HttpError(400, msg);
export const notFound = (what = 'Record') => new HttpError(404, `${what} not found`);
export const today = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10); // IST
export const genPassword = () => crypto.randomBytes(6).toString('base64').replace(/[+/=]/g, '').slice(0, 8);
export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
export const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400e3);
export const pick = (obj, keys) => Object.fromEntries(keys.filter(k => obj[k] !== undefined).map(k => [k, obj[k] === '' ? null : obj[k]]));

/** Build "INSERT"/"UPDATE" statements from a whitelisted object. */
export function insert(db, table, data) {
  const k = Object.keys(data);
  if (!k.length) throw bad('No data supplied');
  const r = db.prepare(`INSERT INTO ${table} (${k.join(',')}) VALUES (${k.map(() => '?').join(',')})`).run(...Object.values(data));
  return Number(r.lastInsertRowid);
}
export function update(db, table, id, data) {
  const k = Object.keys(data);
  if (!k.length) return 0;
  return db.prepare(`UPDATE ${table} SET ${k.map(x => `${x}=?`).join(',')} WHERE id=?`).run(...Object.values(data), id).changes;
}
