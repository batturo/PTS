import { Router } from 'express';
import { db, tx } from '../db.js';
import { allow, isFamily, myStudent } from '../auth.js';
import { bad, notFound, pick, insert, update, today, HttpError } from '../util.js';
import { isAdmin, isClassTeacher, teachesSubject, linkedTo, requireClassTeacher, requireSection, requireExam, teacherRowFilter } from '../scope.js';

export const academicsRouter = Router();
const TEACH = ['teacher'];
const STAFF = ['admin', 'teacher', 'accountant', 'librarian', 'driver'];
const blank = (v) => v == null || v === '';

/**
 * Who may write each kind of row (administrators may always):
 *  subject – the teacher allotted that subject in that class/section (blank section = every section of the class)
 *  classTeacher – the class teacher of that section
 *  linked – a class or subject teacher of that class/section (no school-wide posts by teachers)
 * Librarian, accountant and driver may post notices anywhere (library, fee and transport notices).
 */
const RULES = {
  subject: (u, r) => teachesSubject(u, r.class, r.section, r.subject),
  classTeacher: (u, r) => isClassTeacher(u, r.class, r.section),
  linked: (u, r) => linkedTo(u, r.class, r.section),
};
const RULE_MESSAGES = {
  subject: (r) => `${r.subject || 'This subject'} in ${r.class || 'this class'}${blank(r.section) ? ' (all sections)' : '-' + r.section} is not allotted to you. Ask an administrator to allot it.`,
  classTeacher: (r) => `Only the class teacher of ${r.class}-${r.section} (or an administrator) can change its time table.`,
  linked: (r) => blank(r.class) ? 'Teachers can post only to the classes they teach. Choose a class.' : `You do not teach ${r.class}${blank(r.section) ? ' (all sections)' : '-' + r.section}.`,
};

const RESOURCES = {
  notices:      { fields: ['title', 'body', 'category', 'class', 'section', 'student_id', 'notice_date'], write: ['teacher', 'librarian', 'accountant', 'driver'], rule: 'linked', order: 'notice_date DESC, id DESC', required: ['title'] },
  materials:    { fields: ['title', 'subject', 'class', 'section', 'description', 'file_url'], write: TEACH, rule: 'subject', order: 'id DESC', required: ['title', 'subject', 'file_url'] },
  videos:       { fields: ['title', 'subject', 'class', 'section', 'description', 'video_url'], write: TEACH, rule: 'subject', order: 'id DESC', required: ['title', 'subject', 'video_url'] },
  homework:     { fields: ['subject', 'title', 'description', 'class', 'section', 'assigned_date', 'due_date', 'attachment_url'], write: TEACH, rule: 'subject', order: 'assigned_date DESC, id DESC', required: ['subject', 'title', 'class'] },
  timetable:    { fields: ['class', 'section', 'day', 'period', 'start_time', 'end_time', 'subject', 'teacher_name'], write: TEACH, rule: 'classTeacher', order: "CASE day WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2 WHEN 'Wednesday' THEN 3 WHEN 'Thursday' THEN 4 WHEN 'Friday' THEN 5 WHEN 'Saturday' THEN 6 ELSE 7 END, period", required: ['class', 'section', 'day', 'period', 'subject'] },
  lesson_plans: { fields: ['class', 'section', 'subject', 'week_start', 'topic', 'objectives', 'activities', 'status'], write: TEACH, rule: 'subject', order: 'subject, week_start DESC', required: ['subject', 'topic', 'class'] },
  events:       { fields: ['title', 'description', 'event_date', 'venue', 'class', 'section'], write: TEACH, rule: 'linked', order: 'event_date', required: ['title', 'event_date'] },
  datesheets:   { fields: ['exam_name', 'class', 'section', 'subject', 'exam_date', 'start_time', 'end_time', 'room'], write: TEACH, rule: 'subject', order: 'exam_name, exam_date, start_time', required: ['exam_name', 'class', 'subject', 'exam_date'] },
};

/** May this user create/change/delete this row? */
function canWrite(u, name, cfg, row) {
  if (isAdmin(u)) return true;
  if (!cfg.write.includes(u.role)) return false;
  if (u.role !== 'teacher') return true; // librarian / accountant / driver notices
  if (name === 'notices' && !blank(row.student_id)) return false;
  return RULES[cfg.rule](u, row);
}

function validate(name, data) {
  if (!blank(data.class)) requireSection(data.class, data.section);
  else if (!blank(data.section)) throw bad('Choose a class for this section');
  if (!blank(data.subject) && !db.prepare('SELECT 1 FROM subjects WHERE name=?').get(data.subject)) throw bad(`${data.subject} is not in the subject list`);
  if (name === 'datesheets') requireExam(data.exam_name);
  if (name === 'videos' && !/^https?:\/\/\S+$/i.test(String(data.video_url || '').trim())) {
    throw bad('Paste a link to the video (for example a YouTube or Google Drive link) starting with https://');
  }
}

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
      if (req.user.role === 'teacher') { // teachers see their own classes plus school-wide items
        const f = teacherRowFilter(req.user);
        where.push(`(${f.sql} OR created_by=?)`); args.push(...f.args, req.user.id);
        if (name === 'notices') where.push('(student_id IS NULL OR created_by=?)'), args.push(req.user.id);
      }
    }
    let rows = db.prepare(`SELECT * FROM ${name} WHERE ${where.join(' AND ')} ORDER BY ${cfg.order} LIMIT 500`).all(...args);
    if (!isFamily(req.user)) rows = rows.map(r => ({ ...r, can_edit: canWrite(req.user, name, cfg, r) }));
    res.json(rows);
  });
  academicsRouter.post(base, allow(...cfg.write), (req, res) => {
    const data = pick(req.body, cfg.fields);
    for (const f of cfg.required) if (blank(data[f])) throw bad(`${f.replace('_', ' ')} is required`);
    if (name === 'videos') data.video_url = String(data.video_url).trim();
    validate(name, data);
    if (!canWrite(req.user, name, cfg, data)) throw new HttpError(403, RULE_MESSAGES[cfg.rule](data));
    res.json({ id: insert(db, name, { ...data, created_by: req.user.id }) });
  });
  academicsRouter.put(`${base}/:id`, allow(...cfg.write), (req, res) => {
    const old = db.prepare(`SELECT * FROM ${name} WHERE id=?`).get(req.params.id);
    if (!old) throw notFound();
    const changes = pick(req.body, cfg.fields);
    if (name === 'videos' && changes.video_url != null) changes.video_url = String(changes.video_url).trim();
    const merged = { ...old, ...changes };
    for (const f of cfg.required) if (blank(merged[f])) throw bad(`${f.replace('_', ' ')} is required`);
    validate(name, merged);
    if (!canWrite(req.user, name, cfg, old)) throw new HttpError(403, RULE_MESSAGES[cfg.rule](old));
    if (!canWrite(req.user, name, cfg, merged)) throw new HttpError(403, RULE_MESSAGES[cfg.rule](merged));
    update(db, name, old.id, changes);
    res.json({ ok: true });
  });
  academicsRouter.delete(`${base}/:id`, allow(...cfg.write), (req, res) => {
    const old = db.prepare(`SELECT * FROM ${name} WHERE id=?`).get(req.params.id);
    if (!old) throw notFound();
    if (!canWrite(req.user, name, cfg, old)) throw new HttpError(403, RULE_MESSAGES[cfg.rule](old));
    db.prepare(`DELETE FROM ${name} WHERE id=?`).run(old.id);
    res.json({ ok: true });
  });
}

/** Every student id must be an active student of class/section (stops edits to other classes via crafted requests). */
function requireStudentsIn(ids, cls, section) {
  const ok = new Set(db.prepare('SELECT id FROM students WHERE class=? AND section=?').all(String(cls), String(section)).map(r => r.id));
  const outside = ids.filter(id => !ok.has(Number(id)));
  if (outside.length) throw bad(`${outside.length} student(s) are not in ${cls}-${section}`);
}
function requireLinked(u, cls, section) {
  if (u.role === 'teacher' && !linkedTo(u, cls, section)) throw new HttpError(403, `You do not teach ${cls}-${section}`);
}

// ---------- Attendance (class teacher) ----------
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
  requireLinked(req.user, cls, section);
  res.json(db.prepare(`SELECT s.id AS student_id, s.name, s.roll_no, s.admission_no, a.status
    FROM students s LEFT JOIN attendance a ON a.student_id=s.id AND a.date=?
    WHERE s.class=? AND s.section=? AND s.active=1 ORDER BY CAST(s.roll_no AS INTEGER), s.name`).all(date, cls, section));
});
academicsRouter.post('/attendance', allow('teacher'), (req, res) => {
  const { date, records, class: cls, section } = req.body;
  if (!date || !Array.isArray(records) || !cls || !section) throw bad('Date, class, section and records are required');
  requireClassTeacher(req.user, cls, section);
  requireStudentsIn(records.map(r => r.student_id), cls, section);
  if (records.some(r => r.status && !['P', 'A', 'L', 'H'].includes(r.status))) throw bad('Invalid attendance status');
  const up = db.prepare(`INSERT INTO attendance(student_id, date, status, marked_by) VALUES (?,?,?,?)
    ON CONFLICT(student_id, date) DO UPDATE SET status=excluded.status, marked_by=excluded.marked_by`);
  tx(() => records.filter(r => r.status).forEach(r => up.run(r.student_id, date, r.status, req.user.id)));
  res.json({ ok: true, saved: records.filter(r => r.status).length });
});
academicsRouter.get('/attendance/report', allow('teacher'), (req, res) => {
  const { class: cls, section, month } = req.query; // month = YYYY-MM
  if (!cls || !section) throw bad('Choose class and section');
  requireLinked(req.user, cls, section);
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
    return res.json({ exams: db.prepare('SELECT name FROM exam_types ORDER BY sort_order, start_date, name').all().map(r => r.name) });
  }
  requireLinked(req.user, cls, section);
  res.json(db.prepare(`SELECT s.id AS student_id, s.name, s.roll_no, r.id, r.max_marks, r.marks_obtained, r.remarks
    FROM students s LEFT JOIN results r ON r.student_id=s.id AND r.exam_name=? AND r.subject=?
    WHERE s.class=? AND s.section=? AND s.active=1 ORDER BY CAST(s.roll_no AS INTEGER), s.name`).all(exam_name, subject, cls, section));
});
academicsRouter.post('/results', allow('teacher'), (req, res) => {
  const { exam_name, subject, max_marks, records, class: cls, section } = req.body;
  if (!exam_name || !subject || !(max_marks > 0) || !Array.isArray(records) || !cls || !section) throw bad('Exam, class, section, subject, maximum marks and records are required');
  requireExam(exam_name);
  requireSection(cls, section);
  if (!teachesSubject(req.user, cls, section, subject)) throw new HttpError(403, RULE_MESSAGES.subject({ class: cls, section, subject }));
  requireStudentsIn(records.map(r => r.student_id), cls, section);
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
  if (req.user.role === 'teacher') { // class teachers handle their own sections' leave
    where.push(`EXISTS (SELECT 1 FROM sections sc JOIN classes c ON c.id=sc.class_id WHERE c.name=s.class AND sc.name=s.section AND sc.class_teacher_id=?)`);
    args.push(req.user.id);
  }
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
  const st = db.prepare('SELECT class, section FROM students WHERE id=?').get(l.student_id);
  requireClassTeacher(req.user, st.class, st.section);
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
  if (!isFamily(req.user)) {
    if (!['admin', 'teacher'].includes(req.user.role)) throw bad('Not allowed');
    const st = db.prepare('SELECT class, section FROM students WHERE id=?').get(l.student_id);
    requireClassTeacher(req.user, st.class, st.section);
  }
  db.prepare('DELETE FROM leaves WHERE id=?').run(l.id);
  res.json({ ok: true });
});
