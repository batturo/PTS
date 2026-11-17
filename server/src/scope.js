// Who may change what, based on the administrator's allotments:
//  - Administrators: everything.
//  - Class teachers: students, attendance, timetable and leave requests of their own section(s).
//  - Subject teachers: subject content (study material, videos, homework, lesson plans, results, date-sheet papers)
//    for the subjects allotted to them in those sections.
//  - Any teacher linked to a section (class or subject teacher) can read it and post notices/events for it.
import { db } from './db.js';
import { HttpError } from './util.js';

const forbid = (msg) => new HttpError(403, msg);
const blank = (v) => v == null || v === '';

/** The sections and subjects allotted to a teacher. */
export function teacherScope(userId) {
  const classTeacherOf = db.prepare(`SELECT c.name AS class, s.name AS section FROM sections s JOIN classes c ON c.id=s.class_id
    WHERE s.class_teacher_id=? ORDER BY c.sort_order, c.name, s.name`).all(userId);
  const subjects = db.prepare(`SELECT c.name AS class, s.name AS section, a.subject FROM subject_allotments a
    JOIN sections s ON s.id=a.section_id JOIN classes c ON c.id=s.class_id
    WHERE a.teacher_id=? ORDER BY c.sort_order, c.name, s.name, a.subject`).all(userId);
  const key = (r) => `${r.class}|${r.section}`;
  const linked = [...new Map([...classTeacherOf, ...subjects].map(r => [key(r), { class: r.class, section: r.section }])).values()];
  return { classTeacherOf, subjects, linked };
}

export const isAdmin = (u) => u.role === 'admin';

export function isClassTeacher(u, cls, section) {
  if (isAdmin(u)) return true;
  if (u.role !== 'teacher' || blank(cls) || blank(section)) return false;
  return !!db.prepare(`SELECT 1 FROM sections s JOIN classes c ON c.id=s.class_id WHERE c.name=? AND s.name=? AND s.class_teacher_id=?`)
    .get(String(cls), String(section), u.id);
}

/** Teaches `subject` in class/section. A blank section means "the whole class": the teacher must teach it in every section. */
export function teachesSubject(u, cls, section, subject) {
  if (isAdmin(u)) return true;
  if (u.role !== 'teacher' || blank(cls) || blank(subject)) return false;
  if (!blank(section)) {
    return !!db.prepare(`SELECT 1 FROM subject_allotments a JOIN sections s ON s.id=a.section_id JOIN classes c ON c.id=s.class_id
      WHERE c.name=? AND s.name=? AND a.subject=? AND a.teacher_id=?`).get(String(cls), String(section), String(subject), u.id);
  }
  const sections = db.prepare('SELECT s.id FROM sections s JOIN classes c ON c.id=s.class_id WHERE c.name=?').all(String(cls));
  if (!sections.length) return false;
  return sections.every(s => db.prepare('SELECT 1 FROM subject_allotments WHERE section_id=? AND subject=? AND teacher_id=?').get(s.id, String(subject), u.id));
}

/** Is linked to the class/section (as class teacher or subject teacher). A blank section requires a link to the whole class. */
export function linkedTo(u, cls, section) {
  if (isAdmin(u)) return true;
  if (u.role !== 'teacher' || blank(cls)) return false;
  const { linked } = teacherScope(u.id);
  if (!blank(section)) return linked.some(l => l.class === String(cls) && l.section === String(section));
  const sections = db.prepare('SELECT s.name FROM sections s JOIN classes c ON c.id=s.class_id WHERE c.name=?').all(String(cls));
  return sections.length > 0 && sections.every(s => linked.some(l => l.class === String(cls) && l.section === s.name));
}

export function requireClassTeacher(u, cls, section) {
  if (!isClassTeacher(u, cls, section)) throw forbid(`Only the class teacher of ${cls}-${section} (or an administrator) can do this`);
}
export function requireSubject(u, cls, section, subject) {
  if (!teachesSubject(u, cls, section, subject)) {
    throw forbid(`${subject || 'This subject'} in ${cls}${blank(section) ? '' : '-' + section} is not allotted to you. Ask an administrator to allot it.`);
  }
}

/** The class/section must exist in Classes & Sections. */
export function requireSection(cls, section) {
  if (blank(cls)) throw new HttpError(400, 'Class is required');
  const c = db.prepare('SELECT id FROM classes WHERE name=?').get(String(cls));
  if (!c) throw new HttpError(400, `Class ${cls} does not exist. An administrator can add it under Classes & Teachers.`);
  if (!blank(section) && !db.prepare('SELECT 1 FROM sections WHERE class_id=? AND name=?').get(c.id, String(section))) {
    throw new HttpError(400, `Section ${cls}-${section} does not exist. An administrator can add it under Classes & Teachers.`);
  }
}
export function requireExam(name) {
  if (!db.prepare('SELECT 1 FROM exam_types WHERE name=?').get(String(name || ''))) {
    throw new HttpError(400, `"${name}" is not one of this year's exams. An administrator can add it under Exams.`);
  }
}

/** SQL filter limiting class-scoped rows to the teacher's sections (plus school-wide rows). */
export function teacherRowFilter(u, { classCol = 'class', sectionCol = 'section' } = {}) {
  const { linked } = teacherScope(u.id);
  const parts = [`(${classCol} IS NULL OR ${classCol} = '')`];
  const args = [];
  const byClass = {};
  for (const l of linked) (byClass[l.class] ||= []).push(l.section);
  for (const [c, secs] of Object.entries(byClass)) {
    parts.push(`(${classCol} = ? AND (${sectionCol} IS NULL OR ${sectionCol} = '' OR ${sectionCol} IN (${secs.map(() => '?').join(',')})))`);
    args.push(c, ...secs);
  }
  return { sql: `(${parts.join(' OR ')})`, args };
}
