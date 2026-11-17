import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

/**
 * Database access. Two interchangeable drivers expose the same small API (exec / prepare().get/all/run):
 *  - Node's built-in SQLite (a file on disk) when running as a normal server;
 *  - SQLite compiled to WebAssembly (sql.js), used by the Netlify Function, which saves the database to Netlify Blobs.
 */
export const SERVERLESS = !!(process.env.SERVERLESS || process.env.AWS_LAMBDA_FUNCTION_NAME);
let impl = null;
export const db = {
  exec: (sql) => impl.exec(sql),
  prepare: (sql) => impl.prepare(sql),
};
export const hasDatabase = () => !!impl;

/** Switch to a database driver and make sure all tables and default settings exist. */
export function useDatabase(driver) {
  impl = driver;
  migrate();
}

function openNodeSqlite() {
  const here = (() => { try { return path.dirname(fileURLToPath(import.meta.url)); } catch { return process.cwd(); } })();
  const dataDir = process.env.DATA_DIR || path.join(here, '..', 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const { DatabaseSync } = process.getBuiltinModule('node:sqlite');
  const d = new DatabaseSync(path.join(dataDir, 'school.db'));
  d.exec('PRAGMA journal_mode = WAL;');
  return d;
}

function migrate() {
db.exec('PRAGMA foreign_keys = ON;');
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','accountant','teacher','driver','librarian','student','parent')),
  name TEXT NOT NULL,
  phone TEXT, email TEXT,
  student_id INTEGER,                 -- for student / parent logins
  active INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admission_no TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL, father_name TEXT, mother_name TEXT,
  dob TEXT, gender TEXT, blood_group TEXT,
  address TEXT, class TEXT NOT NULL, section TEXT NOT NULL, roll_no TEXT,
  mobile TEXT, email TEXT, route_no TEXT,
  concession_pct REAL NOT NULL DEFAULT 0,
  photo_url TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);

-- ---------- Academic (teacher-provided) ----------
CREATE TABLE IF NOT EXISTS attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  date TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('P','A','L','H')),
  marked_by INTEGER, UNIQUE(student_id, date)
);
CREATE TABLE IF NOT EXISTS results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  exam_name TEXT NOT NULL, subject TEXT NOT NULL,
  max_marks REAL NOT NULL, marks_obtained REAL NOT NULL, remarks TEXT,
  UNIQUE(student_id, exam_name, subject)
);
CREATE TABLE IF NOT EXISTS notices (
  id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, body TEXT,
  category TEXT DEFAULT 'General', class TEXT, section TEXT, student_id INTEGER,
  notice_date TEXT DEFAULT (date('now')), created_by INTEGER
);
CREATE TABLE IF NOT EXISTS materials (
  id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, subject TEXT,
  class TEXT, section TEXT, description TEXT, file_url TEXT NOT NULL,
  created_at TEXT DEFAULT (date('now')), created_by INTEGER
);
CREATE TABLE IF NOT EXISTS videos (
  id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, subject TEXT,
  class TEXT, section TEXT, description TEXT, video_url TEXT NOT NULL,
  created_at TEXT DEFAULT (date('now')), created_by INTEGER
);
CREATE TABLE IF NOT EXISTS homework (
  id INTEGER PRIMARY KEY AUTOINCREMENT, subject TEXT NOT NULL, title TEXT NOT NULL,
  description TEXT, class TEXT, section TEXT, assigned_date TEXT DEFAULT (date('now')),
  due_date TEXT, attachment_url TEXT, created_by INTEGER
);
CREATE TABLE IF NOT EXISTS timetable (
  id INTEGER PRIMARY KEY AUTOINCREMENT, class TEXT NOT NULL, section TEXT NOT NULL,
  day TEXT NOT NULL, period INTEGER NOT NULL, start_time TEXT, end_time TEXT,
  subject TEXT NOT NULL, teacher_name TEXT, created_by INTEGER
);
CREATE TABLE IF NOT EXISTS lesson_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT, class TEXT, section TEXT, subject TEXT NOT NULL,
  week_start TEXT, topic TEXT NOT NULL, objectives TEXT, activities TEXT,
  status TEXT DEFAULT 'Planned', created_by INTEGER
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT,
  event_date TEXT NOT NULL, venue TEXT, class TEXT, section TEXT, created_by INTEGER
);
CREATE TABLE IF NOT EXISTS datesheets (
  id INTEGER PRIMARY KEY AUTOINCREMENT, exam_name TEXT NOT NULL, class TEXT NOT NULL, section TEXT,
  subject TEXT NOT NULL, exam_date TEXT NOT NULL, start_time TEXT, end_time TEXT, room TEXT, created_by INTEGER
);
CREATE TABLE IF NOT EXISTS leaves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  from_date TEXT NOT NULL, to_date TEXT NOT NULL, reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Pending', reviewer_remark TEXT,
  applied_by INTEGER, reviewed_by INTEGER, created_at TEXT DEFAULT (datetime('now'))
);

-- ---------- Fees ----------
CREATE TABLE IF NOT EXISTS fee_structures (
  id INTEGER PRIMARY KEY AUTOINCREMENT, class TEXT NOT NULL, fee_head TEXT NOT NULL,
  amount REAL NOT NULL, frequency TEXT NOT NULL DEFAULT 'Monthly'
);
CREATE TABLE IF NOT EXISTS fee_invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_no TEXT UNIQUE,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  period TEXT NOT NULL, items TEXT NOT NULL, gross REAL NOT NULL,
  concession REAL NOT NULL DEFAULT 0, total REAL NOT NULL, due_date TEXT NOT NULL,
  waived_fine REAL NOT NULL DEFAULT 0, created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(student_id, period)
);
CREATE TABLE IF NOT EXISTS fee_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT, receipt_no TEXT UNIQUE,
  invoice_id INTEGER NOT NULL REFERENCES fee_invoices(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL, amount REAL NOT NULL, mode TEXT NOT NULL,
  reference TEXT, paid_on TEXT NOT NULL, received_by INTEGER
);

-- ---------- Payroll ----------
CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT, emp_code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL, father_name TEXT, mother_name TEXT, dob TEXT, gender TEXT,
  profession TEXT, department TEXT, address TEXT, phone TEXT, email TEXT,
  pan TEXT, aadhaar TEXT, uan TEXT, bank_name TEXT, bank_account TEXT, ifsc TEXT,
  join_date TEXT, pay_type TEXT NOT NULL DEFAULT 'Monthly',
  basic REAL DEFAULT 0, da REAL DEFAULT 0, hra REAL DEFAULT 0, other_allowance REAL DEFAULT 0,
  hourly_rate REAL DEFAULT 0, std_hours_per_day REAL DEFAULT 8,
  pf_enabled INTEGER DEFAULT 1, esi_enabled INTEGER DEFAULT 1, pt_enabled INTEGER DEFAULT 1,
  tds_monthly REAL DEFAULT 0, user_id INTEGER,
  status TEXT NOT NULL DEFAULT 'Active', exit_date TEXT, exit_reason TEXT
);
CREATE TABLE IF NOT EXISTS employee_attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  date TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('P','A','HD','L')),
  check_in TEXT, check_out TEXT, hours_worked REAL DEFAULT 0,
  UNIQUE(employee_id, date)
);
CREATE TABLE IF NOT EXISTS holidays (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT UNIQUE NOT NULL, name TEXT);
CREATE TABLE IF NOT EXISTS payroll_adjustments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  month TEXT NOT NULL, type TEXT NOT NULL, amount REAL NOT NULL, note TEXT
);
CREATE TABLE IF NOT EXISTS payroll (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  month TEXT NOT NULL, details TEXT NOT NULL,
  gross REAL NOT NULL, total_deductions REAL NOT NULL, net_pay REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'Processed', paid_on TEXT, payment_mode TEXT, payment_ref TEXT,
  UNIQUE(employee_id, month)
);

-- ---------- Library ----------
CREATE TABLE IF NOT EXISTS books (
  id INTEGER PRIMARY KEY AUTOINCREMENT, accession_no TEXT UNIQUE,
  title TEXT NOT NULL, author TEXT NOT NULL, genre TEXT, isbn TEXT, publisher TEXT,
  cabinet_no TEXT, shelf_no TEXT, row_no TEXT, column_no TEXT,
  total_copies INTEGER NOT NULL DEFAULT 1, available_copies INTEGER NOT NULL DEFAULT 1,
  added_on TEXT DEFAULT (date('now'))
);
CREATE TABLE IF NOT EXISTS book_issues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id INTEGER NOT NULL REFERENCES books(id),
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  issue_date TEXT NOT NULL, due_date TEXT NOT NULL, return_date TEXT,
  fine REAL DEFAULT 0, last_reminder TEXT, issued_by INTEGER
);

-- ---------- Transport ----------
CREATE TABLE IF NOT EXISTS bus_routes (
  id INTEGER PRIMARY KEY AUTOINCREMENT, route_no TEXT UNIQUE NOT NULL, route_name TEXT,
  bus_no TEXT, driver_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  stops TEXT DEFAULT '[]', trip_active INTEGER DEFAULT 0, trip_type TEXT,
  lat REAL, lng REAL, speed REAL, heading REAL, location_updated_at TEXT
);
`);
const defaults = {
  school_name: 'Demo Public School',
  school_address: 'Sector 12, New Delhi - 110001',
  academic_year: '2026-27',
  fee_fine_per_day: '10', fee_fine_cap: '500',
  library_issue_days: '14', library_fine_per_day: '2', library_max_books: '3',
  pf_rate: '12', pf_wage_ceiling: '15000',
  esi_employee_rate: '0.75', esi_employer_rate: '3.25', esi_wage_limit: '21000',
  pt_amount: '200', pt_threshold: '15000', ot_multiplier: '1',
};
  // Secret used to sign login tokens (kept out of the settings screens). JWT_SECRET env var overrides it.
  db.prepare('INSERT OR IGNORE INTO settings(key, value) VALUES (?, ?)').run('_jwt_secret', crypto.randomBytes(32).toString('hex'));
const ins = db.prepare('INSERT OR IGNORE INTO settings(key, value) VALUES (?, ?)');
for (const [k, v] of Object.entries(defaults)) ins.run(k, v);
  migrateAcademicStructure();
}

export const DEFAULT_SUBJECTS = ['English', 'Hindi', 'Mathematics', 'Science', 'Social Science', 'Sanskrit', 'Computer Science',
  'Physics', 'Chemistry', 'Biology', 'Accountancy', 'Economics', 'Business Studies', 'Physical Education', 'EVS', 'Art', 'Music'];

/**
 * Classes, sections (with class teachers), subjects, subject-teacher allotments and the year's exam types.
 * Students and content keep class/section/subject/exam as plain text that must match these records.
 * Version 2 back-fills the new tables from existing data so an existing school keeps working after the upgrade.
 */
function migrateAcademicStructure() {
  db.exec(`
  CREATE TABLE IF NOT EXISTS classes (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS sections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    class_teacher_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE(class_id, name)
  );
  CREATE TABLE IF NOT EXISTS subjects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL);
  CREATE TABLE IF NOT EXISTS subject_allotments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    section_id INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
    subject TEXT NOT NULL,
    teacher_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE(section_id, subject)
  );
  CREATE TABLE IF NOT EXISTS exam_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL,
    start_date TEXT, end_date TEXT, max_marks REAL NOT NULL DEFAULT 100, sort_order INTEGER NOT NULL DEFAULT 0
  );`);
  const version = Number(db.prepare("SELECT value FROM settings WHERE key='_schema_version'").get()?.value || 1);
  if (version >= 2) return;
  const sortKey = (c) => { const order = ['Nursery', 'LKG', 'UKG']; const i = order.indexOf(c); return i >= 0 ? i - 10 : Number(c) || 100; };
  const pairs = db.prepare(`SELECT class, section FROM students UNION SELECT class, section FROM timetable
    UNION SELECT class, section FROM datesheets WHERE section IS NOT NULL AND section <> ''`).all().filter(p => p.class && p.section);
  for (const { class: c, section: sec } of pairs) {
    db.prepare('INSERT OR IGNORE INTO classes(name, sort_order) VALUES (?, ?)').run(c, sortKey(c));
    const cid = db.prepare('SELECT id FROM classes WHERE name=?').get(c).id;
    db.prepare('INSERT OR IGNORE INTO sections(class_id, name) VALUES (?, ?)').run(cid, sec);
  }
  const usedSubjects = db.prepare(`SELECT subject FROM results UNION SELECT subject FROM timetable UNION SELECT subject FROM homework
    UNION SELECT subject FROM datesheets UNION SELECT subject FROM lesson_plans`).all().map(r => r.subject).filter(Boolean);
  for (const s of new Set([...DEFAULT_SUBJECTS, ...usedSubjects])) db.prepare('INSERT OR IGNORE INTO subjects(name) VALUES (?)').run(s);
  const exams = db.prepare('SELECT exam_name, MAX(max_marks) m FROM results GROUP BY exam_name UNION SELECT exam_name, NULL FROM datesheets').all();
  exams.forEach((e, i) => db.prepare('INSERT OR IGNORE INTO exam_types(name, max_marks, sort_order) VALUES (?, ?, ?)').run(e.exam_name, e.m || 100, i + 1));
  db.prepare("INSERT INTO settings(key, value) VALUES ('_schema_version', '2') ON CONFLICT(key) DO UPDATE SET value='2'").run();
}

if (!SERVERLESS) useDatabase(openNodeSqlite());

export function getSettings() { // excludes internal keys such as _jwt_secret
  return Object.fromEntries(db.prepare("SELECT key, value FROM settings WHERE key NOT LIKE '\\_%' ESCAPE '\\'").all().map(r => [r.key, r.value]));
}
export const setting = (k) => db.prepare('SELECT value FROM settings WHERE key=?').get(k)?.value;
export const num = (k) => Number(setting(k) || 0);

export function tx(fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}
