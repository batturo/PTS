import { Router } from 'express';
import { db, tx } from '../db.js';
import { allow, isFamily, myStudent } from '../auth.js';
import { bad, notFound, pick, insert, update, today } from '../util.js';

export const academicsRouter = Router();
const TEACH = ['teacher'];
const STAFF = ['admin', 'teacher', 'accountant', 'librarian', 'driver'];

/**
 * Class-scoped content written by staff and read by students/parents of the matching class & section.
 * A blank class / section means "whole school" / "all sections".
 */
const RESOURCES = {
  notices:      { fields: ['title', 'body', 'category', 'class', 'section', 'student_id', 'notice_date'], write: ['teacher', 'librarian', 'accountant', 'driver'], order: 'notice_date DESC, id DESC', required: ['title'] },
  materials:    { fields: ['title', 'subject', 'class', 'section', 'description', 'file_url'], write: TEACH, order: 'id DESC', required: ['title', 'file_url'] },
  videos:       { fields: ['title', 'subject', 'class', 'section', 'description', 'video_url'], write: TEACH, order: 'id DESC', required: ['title', 'video_url'] },
  homework:     { fields: ['subject', 'title', 'description', 'class', 'section', 'assigned_date', 'due_date', 'attachment_url'], write: TEACH, order: 'assigned_date DESC, id DESC', required: ['subject', 'title', 'class'] },
  timetable:    { fields: ['class', 'section', 'day', 'period', 'start_time', 'end_time', 'subject', 'teacher_name'], write: TEACH, order: "CASE day WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2 WHEN 'Wednesday' THEN 3 WHEN 'Thursday' THEN 4 WHEN 'Friday' THEN 5 WHEN 'Saturday' THEN 6 ELSE 7 END, period", required: ['class', 'section', 'day', 'period', 'subject'] },
  lesson_plans: { fields: ['class', 'section', 'subject', 'week_start', 'topic', 'objectives', 'activities', 'status'], write: TEACH, order: 'subject, week_start DESC', required: ['subject', 'topic'] },
  events:       { fields: ['title', 'description', 'event_date', 'venue', 'class', 'section'], write: TEACH, order: 'event_date', required: ['title', 'event_date'] },
  datesheets:   { fields: ['exam_name', 'class', 'section', 'subject', 'exam_date', 'start_time', 'end_time', 'room'], write: TEACH, order: 'exam_name, exam_date, start_time', required: ['exam_name', 'class', 'subject', 'exam_date'] },
};

for (const [name, cfg] of Object.entries(RESOURCES)) {
  const base = `/${name.replace('_', '-')}`;

  academicsRouter.get(base, (req, res) => {
    const where = ['1=1'], args = [];
    if (isFamily(req.user)) {
      const s = myStudent(req);
      where.push("(class IS NULL OR class='' OR class=?)", "(section IS NULL OR section='' OR section=?)");
      args.push(s.class, s.section);
      if (cfg.fields.includes('student_id')) { where.push('(student_id IS NULL OR student_id=?)'); args.push(s.id); }
      if (name === 'events' && req.query.upcoming !== '0') { where.push('event_date >= ?'); args.push(today()); }
    } else {
      for (const f of ['class', 'section', 'subject', 'category', 'exam_name', 'day']) {
        if (req.query[f] && cfg.fields.includes(f)) { where.push(`${f}=?`); args.push(req.query[f]); }
      }
    }
    res.json(db.prepare(`SELECT * FROM ${name} WHERE ${where.join(' AND ')} ORDER BY ${cfg.order} LIMIT 500`).all(...args));
  });
  academicsRouter.post(base, allow(...cfg.write), (req, res) => {
    const data = pick(req.body, cfg.fields);
    for (const f of cfg.required) if (data[f] == null) throw bad(`${f.replace('_', ' ')} is required`);
    res.json({ id: insert(db, name, { ...data, created_by: req.user.id }) });
  });
  academicsRouter.put(`${base}/:id`, allow(...cfg.write), (req, res) => {
    if (!update(db, name, req.params.id, pick(req.body, cfg.fields))) throw notFound();
    res.json({ ok: true });
  });
  academicsRouter.delete(`${base}/:id`, allow(...cfg.write), (req, res) => {
    db.prepare(`DELETE FROM ${name} WHERE id=?`).run(req.params.id);
    res.json({ ok: true });
  });
}

// ---------- Attendance ----------
academicsRouter.get('/attendance', (req, res) => {
  if (isFamily(req.user)) {
    const s = myStudent(req);
    const rows = db.prepare('SELECT date, status FROM attendance WHERE student_id=? ORDER BY date DESC').all(s.id);
    const working = rows.filter(r => r.status !== 'H');
    const present = working.filter(r => r.status === 'P').length;
    return res.json({ records: rows, summary: { working: working.length, present, absent: working.filter(r => r.status === 'A').length,
      leave: working.filter(r => r.status === 'L').length, percent: working.length ? Math.round(present / working.length * 1000) / 10 : null } });
  }
  if (!STAFF.includes(req.user.role)) throw bad('Not allowed');
  const { class: cls, section, date = today() } = req.query;
  if (!cls || !section) throw bad('Choose class and section');
  res.json(db.prepare(`SELECT s.id AS student_id, s.name, s.roll_no, s.admission_no, a.status
    FROM students s LEFT JOIN attendance a ON a.student_id=s.id AND a.date=?
    WHERE s.class=? AND s.section=? AND s.active=1 ORDER BY CAST(s.roll_no AS INTEGER), s.name`).all(date, cls, section));
});
academicsRouter.post('/attendance', allow('teacher'), (req, res) => {
  const { date, records } = req.body;
  if (!date || !Array.isArray(records)) throw bad('Date and records are required');
  const up = db.prepare(`INSERT INTO attendance(student_id, date, status, marked_by) VALUES (?,?,?,?)
    ON CONFLICT(student_id, date) DO UPDATE SET status=excluded.status, marked_by=excluded.marked_by`);
  tx(() => records.filter(r => r.status).forEach(r => up.run(r.student_id, date, r.status, req.user.id)));
  res.json({ ok: true, saved: records.filter(r => r.status).length });
});
academicsRouter.get('/attendance/report', allow('teacher'), (req, res) => {
  const { class: cls, section, month } = req.query; // month = YYYY-MM
  res.json(db.prepare(`SELECT s.id, s.name, s.roll_no,
      SUM(a.status='P') AS present, SUM(a.status='A') AS absent, SUM(a.status='L') AS leave, SUM(a.status IN ('P','A','L')) AS working
    FROM students s LEFT JOIN attendance a ON a.student_id=s.id AND a.date LIKE ?
    WHERE s.class=? AND s.section=? GROUP BY s.id ORDER BY CAST(s.roll_no AS INTEGER), s.name`).all(`${month || today().slice(0, 7)}%`, cls, section));
});

// ---------- Results ----------
export const grade = (pct) => pct >= 91 ? 'A1' : pct >= 81 ? 'A2' : pct >= 71 ? 'B1' : pct >= 61 ? 'B2' : pct >= 51 ? 'C1' : pct >= 41 ? 'C2' : pct >= 33 ? 'D' : 'E';
const withGrade = (r) => ({ ...r, percent: Math.round(r.marks_obtained / r.max_marks * 1000) / 10, grade: grade(r.marks_obtained / r.max_marks * 100) });

academicsRouter.get('/results', (req, res) => {
  if (isFamily(req.user)) {
    const s = myStudent(req);
    return res.json(db.prepare('SELECT * FROM results WHERE student_id=? ORDER BY exam_name, subject').all(s.id).map(withGrade));
  }
  if (!STAFF.includes(req.user.role)) throw bad('Not allowed');
  const { class: cls, section, exam_name, subject } = req.query;
  if (!cls || !section || !exam_name || !subject) {
    return res.json({ exams: db.prepare('SELECT DISTINCT exam_name FROM results ORDER BY exam_name').all().map(r => r.exam_name) });
  }
  res.json(db.prepare(`SELECT s.id AS student_id, s.name, s.roll_no, r.id, r.max_marks, r.marks_obtained, r.remarks
    FROM students s LEFT JOIN results r ON r.student_id=s.id AND r.exam_name=? AND r.subject=?
    WHERE s.class=? AND s.section=? AND s.active=1 ORDER BY CAST(s.roll_no AS INTEGER), s.name`).all(exam_name, subject, cls, section));
});
academicsRouter.post('/results', allow('teacher'), (req, res) => {
  const { exam_name, subject, max_marks, records } = req.body;
  if (!exam_name || !subject || !(max_marks > 0) || !Array.isArray(records)) throw bad('Exam, subject, maximum marks and records are required');
  const up = db.prepare(`INSERT INTO results(student_id, exam_name, subject, max_marks, marks_obtained, remarks) VALUES (?,?,?,?,?,?)
    ON CONFLICT(student_id, exam_name, subject) DO UPDATE SET max_marks=excluded.max_marks, marks_obtained=excluded.marks_obtained, remarks=excluded.remarks`);
  const rows = records.filter(r => r.marks_obtained !== '' && r.marks_obtained != null);
  for (const r of rows) if (Number(r.marks_obtained) < 0 || Number(r.marks_obtained) > Number(max_marks)) throw bad(`Marks for student #${r.student_id} must be between 0 and ${max_marks}`);
  tx(() => rows.forEach(r => up.run(r.student_id, exam_name, subject, Number(max_marks), Number(r.marks_obtained), r.remarks || null)));
  res.json({ ok: true, saved: rows.length });
});

// ---------- Leave applications ----------
academicsRouter.get('/leaves', (req, res) => {
  if (isFamily(req.user)) return res.json(db.prepare('SELECT * FROM leaves WHERE student_id=? ORDER BY id DESC').all(myStudent(req).id));
  if (!STAFF.includes(req.user.role)) throw bad('Not allowed');
  const { status, class: cls, section } = req.query;
  const where = ['1=1'], args = [];
  if (status) { where.push('l.status=?'); args.push(status); }
  if (cls) { where.push('s.class=?'); args.push(cls); }
  if (section) { where.push('s.section=?'); args.push(section); }
  res.json(db.prepare(`SELECT l.*, s.name AS student_name, s.class, s.section, s.admission_no, u.role AS applied_by_role
    FROM leaves l JOIN students s ON s.id=l.student_id LEFT JOIN users u ON u.id=l.applied_by
    WHERE ${where.join(' AND ')} ORDER BY l.status='Pending' DESC, l.id DESC`).all(...args));
});
academicsRouter.post('/leaves', allow('student', 'parent'), (req, res) => {
  const { from_date, to_date, reason } = req.body;
  if (!from_date || !to_date || !reason) throw bad('From date, to date and reason are required');
  if (to_date < from_date) throw bad('To date cannot be before from date');
  res.json({ id: insert(db, 'leaves', { student_id: myStudent(req).id, from_date, to_date, reason, applied_by: req.user.id }) });
});
academicsRouter.put('/leaves/:id', allow('teacher'), (req, res) => {
  const { status, reviewer_remark } = req.body;
  if (!['Approved', 'Rejected', 'Pending'].includes(status)) throw bad('Invalid status');
  const l = db.prepare('SELECT * FROM leaves WHERE id=?').get(req.params.id);
  if (!l) throw notFound('Leave');
  tx(() => {
    db.prepare('UPDATE leaves SET status=?, reviewer_remark=?, reviewed_by=? WHERE id=?').run(status, reviewer_remark || null, req.user.id, l.id);
    if (status === 'Approved') { // mark approved days as Leave in attendance
      const up = db.prepare(`INSERT INTO attendance(student_id, date, status, marked_by) VALUES (?,?, 'L', ?)
        ON CONFLICT(student_id, date) DO UPDATE SET status='L'`);
      for (let d = new Date(l.from_date); d <= new Date(l.to_date); d.setUTCDate(d.getUTCDate() + 1)) {
        if (d.getUTCDay() !== 0) up.run(l.student_id, d.toISOString().slice(0, 10), req.user.id);
      }
    }
  });
  res.json({ ok: true });
});
academicsRouter.delete('/leaves/:id', (req, res) => {
  const l = db.prepare('SELECT * FROM leaves WHERE id=?').get(req.params.id);
  if (!l) throw notFound('Leave');
  if (isFamily(req.user) && (l.student_id !== myStudent(req).id || l.status !== 'Pending')) throw bad('Only pending applications can be withdrawn');
  if (!isFamily(req.user) && !['admin', 'teacher'].includes(req.user.role)) throw bad('Not allowed');
  db.prepare('DELETE FROM leaves WHERE id=?').run(l.id);
  res.json({ ok: true });
});
