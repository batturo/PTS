import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

/**
 * Database access. Two interchangeable drivers expose the same small API (exec / prepare().get/all/run):
 *  - Node's built-in SQLite (a file on disk) when running as a normal server (openNodeDatabase);
 *  - SQLite compiled to WebAssembly (sql.js), used by the Netlify Function, which saves the database to Netlify Blobs.
 */
const here = (() => { try { return path.dirname(fileURLToPath(import.meta.url)); } catch { return process.cwd(); } })();
export const DATA_DIR = process.env.DATA_DIR || path.join(here, '..', 'data');
export const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(DATA_DIR, 'uploads');

let impl = null;
export const db = {
  exec: (sql) => impl.exec(sql),
  prepare: (sql) => impl.prepare(sql),
  close: () => impl.close?.(),
};

/** Switch to a database driver and make sure all tables exist. */
export function useDatabase(driver) {
  impl = driver;
  migrate();
}

export function openNodeDatabase() {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const { DatabaseSync } = process.getBuiltinModule('node:sqlite');
  const d = new DatabaseSync(process.env.DB_FILE || path.join(DATA_DIR, 'cafirm.db'));
  d.exec('PRAGMA journal_mode = WAL;');
  useDatabase(d);
}

/** Run fn inside a transaction (nested calls become savepoints). Everything is synchronous, so no interleaving. */
let depth = 0;
export function tx(fn) {
  const sp = `sp${depth}`;
  db.exec(depth ? `SAVEPOINT ${sp}` : 'BEGIN');
  depth++;
  try { const r = fn(); depth--; db.exec(depth ? `RELEASE ${sp}` : 'COMMIT'); return r; }
  catch (e) { depth--; db.exec(depth ? `ROLLBACK TO ${sp}; RELEASE ${sp}` : 'ROLLBACK'); throw e; }
}

function migrate() {
db.exec('PRAGMA foreign_keys = ON;');
db.exec(`
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);

CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  pan TEXT, gstin TEXT, cin TEXT, email TEXT, phone TEXT, address TEXT,
  gst_registered INTEGER NOT NULL DEFAULT 0,
  has_employees INTEGER NOT NULL DEFAULT 0,
  tds_applicable INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','ca','intern','customer')),
  name TEXT NOT NULL,
  phone TEXT, email TEXT,
  client_id INTEGER REFERENCES clients(id),
  active INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS entity_types (code TEXT PRIMARY KEY, name TEXT NOT NULL, sort INTEGER DEFAULT 0);

-- Master list of compliances. frequency: monthly | quarterly | half_yearly | annual | custom.
-- monthly/quarterly use due_day + due_offset_months (months after the period ends);
-- the others use "schedule": JSON [{label, month, day, year_offset}] where year = FY start year + year_offset.
CREATE TABLE IF NOT EXISTS templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, category TEXT NOT NULL, form_no TEXT, description TEXT,
  frequency TEXT NOT NULL,
  due_day INTEGER, due_offset_months INTEGER DEFAULT 1,
  schedule TEXT,
  condition TEXT NOT NULL DEFAULT '',          -- '' | gst | employees | tds
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS template_entities (
  template_id INTEGER NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  PRIMARY KEY (template_id, entity_type)
);
-- Government extensions: a due date that replaces the rule for one period, for every customer.
CREATE TABLE IF NOT EXISTS due_overrides (
  template_id INTEGER NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  fy TEXT NOT NULL, period_label TEXT NOT NULL, due_date TEXT NOT NULL, reason TEXT,
  PRIMARY KEY (template_id, fy, period_label)
);

CREATE TABLE IF NOT EXISTS filings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  template_id INTEGER REFERENCES templates(id),
  name TEXT, category TEXT,                    -- only for ad-hoc filings without a template
  fy TEXT NOT NULL, period_label TEXT NOT NULL, due_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_started',
  filed_on TEXT, ack_no TEXT,
  remarks TEXT,                                -- visible to the customer
  internal_notes TEXT,                         -- staff only
  assigned_to INTEGER REFERENCES users(id),
  updated_by INTEGER, updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE (client_id, template_id, fy, period_label)
);
CREATE INDEX IF NOT EXISTS idx_filings_client ON filings(client_id, due_date);
CREATE INDEX IF NOT EXISTS idx_filings_due ON filings(due_date, status);

CREATE TABLE IF NOT EXISTS filing_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filing_id INTEGER NOT NULL REFERENCES filings(id) ON DELETE CASCADE,
  user_id INTEGER, from_status TEXT, to_status TEXT, note TEXT,
  at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS registration_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, category TEXT NOT NULL, description TEXT,
  required_documents TEXT, timeline TEXT, fee_note TEXT,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS registration_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  type_id INTEGER NOT NULL REFERENCES registration_types(id),
  status TEXT NOT NULL DEFAULT 'submitted',
  applicant_notes TEXT, staff_notes TEXT,
  assigned_to INTEGER REFERENCES users(id),
  created_by INTEGER, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  filing_id INTEGER REFERENCES filings(id) ON DELETE SET NULL,
  request_id INTEGER REFERENCES registration_requests(id) ON DELETE SET NULL,
  title TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'compliance_document',
  original_name TEXT NOT NULL, stored_name TEXT NOT NULL, mime TEXT, size INTEGER,
  visible_to_client INTEGER NOT NULL DEFAULT 1,
  uploaded_by INTEGER NOT NULL, created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_docs_client ON documents(client_id);

-- One row per recipient (customer login), so each person has their own read state.
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  client_id INTEGER NOT NULL,
  filing_id INTEGER, request_id INTEGER,
  title TEXT NOT NULL, body TEXT,
  sender_id INTEGER, created_at TEXT DEFAULT (datetime('now')), read_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, read_at);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER, action TEXT NOT NULL, entity TEXT, entity_id INTEGER, detail TEXT,
  at TEXT DEFAULT (datetime('now'))
);
`);
}

export function setting(key, make) {
  const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
  if (row) return row.value;
  const v = make ? make() : null;
  if (v != null) db.prepare('INSERT INTO settings (key,value) VALUES (?,?)').run(key, v);
  return v;
}
export const jwtSecret = () => process.env.JWT_SECRET || setting('jwt_secret', () => crypto.randomBytes(48).toString('hex'));

export function audit(user, action, entity, entityId, detail) {
  db.prepare('INSERT INTO audit_log (user_id,action,entity,entity_id,detail) VALUES (?,?,?,?,?)')
    .run(user?.id ?? null, action, entity ?? null, entityId ?? null, detail ? String(detail).slice(0, 500) : null);
}
