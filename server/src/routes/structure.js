// Administrator setup: classes, sections & class teachers, subjects, subject-teacher allotments, the year's exams.
import { Router } from 'express';
import { db, tx } from '../db.js';
import { allow } from '../auth.js';
import { bad, notFound, insert, update, pick } from '../util.js';
import { teacherScope } from '../scope.js';

export const structureRouter = Router();
const ADMIN = allow('admin');
const STAFF = allow('admin', 'teacher', 'accountant', 'librarian', 'driver');
const name = (v, what) => { const s = String(v ?? '').trim(); if (!s) throw bad(`${what} is required`); if (s.length > 40) throw bad(`${what} is too long`); return s; };
const teacherOrNull = (id) => {
  if (id === '' || id == null) return null;
  const t = db.prepare("SELECT id FROM users WHERE id=? AND role IN ('teacher','admin') AND active=1").get(id);
  if (!t) throw bad('Choose an active teacher');
  return t.id;
};

/** Everything the screens need to build class/section/subject/exam pickers. */
export function getStructure() {
  const classes = db.prepare('SELECT * FROM classes ORDER BY sort_order, name').all();
  const sections = db.prepare(`SELECT s.*, u.name AS class_teacher_name,
      (SELECT COUNT(*) FROM students st JOIN classes c2 ON c2.id=s.class_id WHERE st.class=c2.name AND st.section=s.name AND st.active=1) AS students
    FROM sections s LEFT JOIN users u ON u.id=s.class_teacher_id ORDER BY s.name`).all();
  const allotments = db.prepare(`SELECT a.id, a.section_id, c.name AS class, s.name AS section, a.subject, a.teacher_id, u.name AS teacher_name
    FROM subject_allotments a JOIN sections s ON s.id=a.section_id JOIN classes c ON c.id=s.class_id LEFT JOIN users u ON u.id=a.teacher_id
    ORDER BY c.sort_order, c.name, s.name, a.subject`).all();
  return {
    classes: classes.map(c => ({ ...c, sections: sections.filter(s => s.class_id === c.id) })),
    subjects: db.prepare('SELECT * FROM subjects ORDER BY name').all(),
    allotments,
    exams: db.prepare('SELECT * FROM exam_types ORDER BY sort_order, start_date, name').all(),
    teachers: db.prepare("SELECT id, name, username, role FROM users WHERE role IN ('teacher','admin') AND active=1 ORDER BY role='admin', name").all(),
  };
}

structureRouter.get('/structure', STAFF, (req, res) => res.json(getStructure()));
structureRouter.get('/my-scope', STAFF, (req, res) => res.json(req.user.role === 'teacher' ? teacherScope(req.user.id) : null));

// ---------- Classes ----------
structureRouter.post('/classes', ADMIN, (req, res) => {
  const n = name(req.body.name, 'Class name');
  if (db.prepare('SELECT 1 FROM classes WHERE name=?').get(n)) throw bad(`Class ${n} already exists`);
  const sort = req.body.sort_order !== undefined && req.body.sort_order !== '' ? Number(req.body.sort_order)
    : (db.prepare('SELECT COALESCE(MAX(sort_order),0)+1 m FROM classes').get().m);
  const id = tx(() => {
    const cid = insert(db, 'classes', { name: n, sort_order: sort });
    for (const s of [].concat(req.body.sections || [])) {
      const sn = String(s).trim();
      if (sn) db.prepare('INSERT OR IGNORE INTO sections(class_id, name) VALUES (?, ?)').run(cid, sn);
    }
    return cid;
  });
  res.json({ id });
});
structureRouter.put('/classes/:id', ADMIN, (req, res) => {
  const c = db.prepare('SELECT * FROM classes WHERE id=?').get(req.params.id);
  if (!c) throw notFound('Class');
  const data = {};
  if (req.body.sort_order !== undefined) data.sort_order = Number(req.body.sort_order) || 0;
  if (req.body.name !== undefined && name(req.body.name, 'Class name') !== c.name) {
    const n = name(req.body.name, 'Class name');
    if (db.prepare('SELECT 1 FROM classes WHERE name=?').get(n)) throw bad(`Class ${n} already exists`);
    data.name = n;
  }
  tx(() => {
    update(db, 'classes', c.id, data);
    if (data.name) { // keep every record that stores the class name in step
      for (const t of ['students', 'notices', 'materials', 'videos', 'homework', 'timetable', 'lesson_plans', 'events', 'datesheets', 'fee_structures'])
        db.prepare(`UPDATE ${t} SET class=? WHERE class=?`).run(data.name, c.name);
    }
  });
  res.json({ ok: true });
});
structureRouter.delete('/classes/:id', ADMIN, (req, res) => {
  const c = db.prepare('SELECT * FROM classes WHERE id=?').get(req.params.id);
  if (!c) throw notFound('Class');
  const n = db.prepare('SELECT COUNT(*) n FROM students WHERE class=?').get(c.name).n;
  if (n) throw bad(`Class ${c.name} has ${n} student(s). Move or remove them first.`);
  db.prepare('DELETE FROM classes WHERE id=?').run(c.id);
  res.json({ ok: true });
});

// ---------- Sections & class teachers ----------
structureRouter.post('/sections', ADMIN, (req, res) => {
  const c = db.prepare('SELECT * FROM classes WHERE id=?').get(req.body.class_id);
  if (!c) throw notFound('Class');
  const n = name(req.body.name, 'Section name');
  if (db.prepare('SELECT 1 FROM sections WHERE class_id=? AND name=?').get(c.id, n)) throw bad(`Section ${c.name}-${n} already exists`);
  res.json({ id: insert(db, 'sections', { class_id: c.id, name: n, class_teacher_id: teacherOrNull(req.body.class_teacher_id) }) });
});
structureRouter.put('/sections/:id', ADMIN, (req, res) => {
  const s = db.prepare('SELECT s.*, c.name AS class FROM sections s JOIN classes c ON c.id=s.class_id WHERE s.id=?').get(req.params.id);
  if (!s) throw notFound('Section');
  const data = {};
  if (req.body.class_teacher_id !== undefined) data.class_teacher_id = teacherOrNull(req.body.class_teacher_id);
  if (req.body.name !== undefined && name(req.body.name, 'Section name') !== s.name) {
    const n = name(req.body.name, 'Section name');
    if (db.prepare('SELECT 1 FROM sections WHERE class_id=? AND name=?').get(s.class_id, n)) throw bad(`Section ${s.class}-${n} already exists`);
    data.name = n;
  }
  tx(() => {
    update(db, 'sections', s.id, data);
    if (data.name) for (const t of ['students', 'notices', 'materials', 'videos', 'homework', 'timetable', 'lesson_plans', 'events', 'datesheets'])
      db.prepare(`UPDATE ${t} SET section=? WHERE class=? AND section=?`).run(data.name, s.class, s.name);
  });
  res.json({ ok: true });
});
structureRouter.delete('/sections/:id', ADMIN, (req, res) => {
  const s = db.prepare('SELECT s.*, c.name AS class FROM sections s JOIN classes c ON c.id=s.class_id WHERE s.id=?').get(req.params.id);
  if (!s) throw notFound('Section');
  const n = db.prepare('SELECT COUNT(*) n FROM students WHERE class=? AND section=?').get(s.class, s.name).n;
  if (n) throw bad(`Section ${s.class}-${s.name} has ${n} student(s). Move or remove them first.`);
  db.prepare('DELETE FROM sections WHERE id=?').run(s.id);
  res.json({ ok: true });
});

// ---------- Subjects ----------
structureRouter.post('/subjects', ADMIN, (req, res) => {
  const n = name(req.body.name, 'Subject');
  if (db.prepare('SELECT 1 FROM subjects WHERE name=?').get(n)) throw bad(`${n} already exists`);
  res.json({ id: insert(db, 'subjects', { name: n }) });
});
structureRouter.delete('/subjects/:id', ADMIN, (req, res) => {
  const s = db.prepare('SELECT * FROM subjects WHERE id=?').get(req.params.id);
  if (!s) throw notFound('Subject');
  if (db.prepare('SELECT 1 FROM subject_allotments WHERE subject=?').get(s.name)) throw bad(`${s.name} is allotted to teachers. Remove those allotments first.`);
  db.prepare('DELETE FROM subjects WHERE id=?').run(s.id);
  res.json({ ok: true });
});

// ---------- Subject-teacher allotments ----------
/** Body: { section_id, subject, teacher_id } – creates or updates the teacher for that subject in that section. */
structureRouter.post('/allotments', ADMIN, (req, res) => {
  const sec = db.prepare('SELECT * FROM sections WHERE id=?').get(req.body.section_id);
  if (!sec) throw notFound('Section');
  const subject = name(req.body.subject, 'Subject');
  if (!db.prepare('SELECT 1 FROM subjects WHERE name=?').get(subject)) throw bad(`Add ${subject} to the subject list first`);
  const teacher = teacherOrNull(req.body.teacher_id);
  db.prepare(`INSERT INTO subject_allotments(section_id, subject, teacher_id) VALUES (?,?,?)
    ON CONFLICT(section_id, subject) DO UPDATE SET teacher_id=excluded.teacher_id`).run(sec.id, subject, teacher);
  res.json({ ok: true });
});
structureRouter.delete('/allotments/:id', ADMIN, (req, res) => {
  db.prepare('DELETE FROM subject_allotments WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- Exams of the year ----------
const EXAM_FIELDS = ['name', 'start_date', 'end_date', 'max_marks', 'sort_order'];
structureRouter.post('/exams', ADMIN, (req, res) => {
  const d = pick(req.body, EXAM_FIELDS);
  d.name = name(d.name, 'Exam name');
  if (db.prepare('SELECT 1 FROM exam_types WHERE name=?').get(d.name)) throw bad(`${d.name} already exists`);
  if (d.max_marks != null && !(Number(d.max_marks) > 0)) throw bad('Maximum marks must be more than 0');
  if (d.start_date && d.end_date && d.end_date < d.start_date) throw bad('End date cannot be before start date');
  if (d.sort_order == null) d.sort_order = db.prepare('SELECT COALESCE(MAX(sort_order),0)+1 m FROM exam_types').get().m;
  res.json({ id: insert(db, 'exam_types', d) });
});
structureRouter.put('/exams/:id', ADMIN, (req, res) => {
  const e = db.prepare('SELECT * FROM exam_types WHERE id=?').get(req.params.id);
  if (!e) throw notFound('Exam');
  const d = pick(req.body, EXAM_FIELDS);
  if (d.name !== undefined) d.name = name(d.name, 'Exam name');
  if (d.name && d.name !== e.name && db.prepare('SELECT 1 FROM exam_types WHERE name=?').get(d.name)) throw bad(`${d.name} already exists`);
  const start = d.start_date !== undefined ? d.start_date : e.start_date, end = d.end_date !== undefined ? d.end_date : e.end_date;
  if (start && end && end < start) throw bad('End date cannot be before start date');
  tx(() => {
    update(db, 'exam_types', e.id, d);
    if (d.name && d.name !== e.name) { // rename everywhere the exam is used
      db.prepare('UPDATE results SET exam_name=? WHERE exam_name=?').run(d.name, e.name);
      db.prepare('UPDATE datesheets SET exam_name=? WHERE exam_name=?').run(d.name, e.name);
    }
  });
  res.json({ ok: true });
});
structureRouter.delete('/exams/:id', ADMIN, (req, res) => {
  const e = db.prepare('SELECT * FROM exam_types WHERE id=?').get(req.params.id);
  if (!e) throw notFound('Exam');
  const used = db.prepare('SELECT (SELECT COUNT(*) FROM results WHERE exam_name=?) + (SELECT COUNT(*) FROM datesheets WHERE exam_name=?) n').get(e.name, e.name).n;
  if (used) throw bad(`${e.name} already has date-sheet entries or results. Delete those first.`);
  db.prepare('DELETE FROM exam_types WHERE id=?').run(e.id);
  res.json({ ok: true });
});
