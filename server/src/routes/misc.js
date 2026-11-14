import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { db, getSettings, num } from '../db.js';
import { allow, isFamily, myStudent } from '../auth.js';
import { bad, today, round2 } from '../util.js';
import { computeInvoice } from './fees.js';

export const miscRouter = Router();
export const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'uploads');

const ALLOWED = { '.pdf': 'application/pdf', '.mp4': 'video/mp4', '.webm': 'video/webm', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.doc': '', '.docx': '', '.ppt': '', '.pptx': '' };
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, f, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${path.extname(f.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (req, f, cb) => cb(ALLOWED[path.extname(f.originalname).toLowerCase()] !== undefined ? null : bad('Only PDF, Office documents, images and MP4/WebM videos are allowed'), true),
});
miscRouter.post('/upload', allow('teacher', 'librarian', 'accountant'), upload.single('file'), (req, res) => {
  if (!req.file) throw bad('No file uploaded');
  res.json({ url: `/uploads/${req.file.filename}`, name: req.file.originalname, size: req.file.size });
});

// Public school branding for the login screen; full settings for staff.
miscRouter.get('/settings/public', (req, res) => { const s = getSettings(); res.json({ school_name: s.school_name, school_address: s.school_address, academic_year: s.academic_year }); });
miscRouter.get('/settings', (req, res) => res.json(getSettings()));
miscRouter.put('/settings', allow('admin'), (req, res) => {
  const up = db.prepare('INSERT INTO settings(key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
  for (const [k, v] of Object.entries(req.body || {})) if (getSettings()[k] !== undefined) up.run(k, String(v));
  res.json(getSettings());
});

const count = (sql, ...a) => db.prepare(sql).get(...a).c;
miscRouter.get('/dashboard', (req, res) => {
  const u = req.user, t = today(), out = { role: u.role };
  if (isFamily(u)) {
    const s = myStudent(req);
    const att = db.prepare("SELECT SUM(status='P') p, SUM(status IN ('P','A','L')) w FROM attendance WHERE student_id=?").get(s.id);
    const inv = db.prepare('SELECT * FROM fee_invoices WHERE student_id=?').all(s.id).map(computeInvoice);
    const cls = "(class IS NULL OR class='' OR class=?) AND (section IS NULL OR section='' OR section=?)";
    Object.assign(out, {
      student: s,
      attendancePct: att.w ? round2(att.p / att.w * 100) : null,
      feeBalance: round2(inv.reduce((a, i) => a + i.balance, 0)),
      booksIssued: count('SELECT COUNT(*) c FROM book_issues WHERE student_id=? AND return_date IS NULL', s.id),
      homeworkDue: db.prepare(`SELECT * FROM homework WHERE ${cls} AND (due_date IS NULL OR due_date>=?) ORDER BY due_date LIMIT 5`).all(s.class, s.section, t),
      notices: db.prepare(`SELECT * FROM notices WHERE ${cls} AND (student_id IS NULL OR student_id=?) ORDER BY notice_date DESC, id DESC LIMIT 5`).all(s.class, s.section, s.id),
      events: db.prepare(`SELECT * FROM events WHERE ${cls} AND event_date>=? ORDER BY event_date LIMIT 5`).all(s.class, s.section, t),
      todayTimetable: db.prepare('SELECT * FROM timetable WHERE class=? AND section=? AND day=? ORDER BY period').all(s.class, s.section,
        new Date(t).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })),
    });
    return res.json(out);
  }
  const has = (r) => u.role === 'admin' || u.role === r;
  if (u.role === 'admin') Object.assign(out, {
    users: db.prepare('SELECT role, COUNT(*) AS count FROM users WHERE active=1 GROUP BY role').all(),
  });
  if (has('teacher')) Object.assign(out, {
    students: count('SELECT COUNT(*) c FROM students WHERE active=1'),
    presentToday: count("SELECT COUNT(*) c FROM attendance WHERE date=? AND status='P'", t),
    markedToday: count('SELECT COUNT(*) c FROM attendance WHERE date=?', t),
    pendingLeaves: count("SELECT COUNT(*) c FROM leaves WHERE status='Pending'"),
    upcomingEvents: db.prepare('SELECT * FROM events WHERE event_date>=? ORDER BY event_date LIMIT 5').all(t),
  });
  if (has('accountant')) {
    const inv = db.prepare('SELECT * FROM fee_invoices').all().map(computeInvoice);
    Object.assign(out, {
      feeCollected: round2(inv.reduce((a, i) => a + i.paid, 0)), feeOutstanding: round2(inv.reduce((a, i) => a + i.balance, 0)),
      feeToday: db.prepare('SELECT COALESCE(SUM(amount),0) a FROM fee_payments WHERE paid_on=?').get(t).a,
      employees: count("SELECT COUNT(*) c FROM employees WHERE status='Active'"),
      lastPayroll: db.prepare('SELECT month, ROUND(SUM(net_pay),2) AS net, COUNT(*) AS count FROM payroll GROUP BY month ORDER BY month DESC LIMIT 1').get() || null,
    });
  }
  if (has('librarian')) Object.assign(out, {
    books: count('SELECT COALESCE(SUM(total_copies),0) c FROM books'),
    booksIssued: count('SELECT COUNT(*) c FROM book_issues WHERE return_date IS NULL'),
    booksOverdue: count('SELECT COUNT(*) c FROM book_issues WHERE return_date IS NULL AND due_date<?', t),
  });
  if (has('driver')) Object.assign(out, {
    routes: count('SELECT COUNT(*) c FROM bus_routes'),
    activeTrips: count('SELECT COUNT(*) c FROM bus_routes WHERE trip_active=1'),
    myRoute: db.prepare('SELECT route_no, bus_no, trip_active, (SELECT COUNT(*) FROM students s WHERE s.route_no=bus_routes.route_no) AS students FROM bus_routes WHERE driver_user_id=?').get(u.id) || null,
  });
  out.notices = db.prepare('SELECT * FROM notices WHERE student_id IS NULL ORDER BY notice_date DESC, id DESC LIMIT 5').all();
  res.json(out);
});
