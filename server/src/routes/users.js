import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db, tx } from '../db.js';
import { allow, sign, authenticate, myStudent, isFamily } from '../auth.js';
import { bad, notFound, genPassword, pick, insert, update } from '../util.js';
import { requireClassTeacher, requireSection, teacherRowFilter, linkedTo, teacherScope } from '../scope.js';

export const authRouter = Router();
export const usersRouter = Router();
export const studentsRouter = Router();

// ---------- Authentication ----------
authRouter.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(String(username || '').trim());
  if (!u || !bcrypt.compareSync(String(password || ''), u.password_hash)) throw bad('Invalid username or password');
  if (!u.active) throw bad('This account has been disabled. Contact the school office.');
  const { password_hash, ...user } = u;
  res.json({ token: sign(u), user });
});
authRouter.get('/me', authenticate, (req, res) => res.json({ user: req.user, student: myStudent(req), scope: req.user.role === 'teacher' ? teacherScope(req.user.id) : null }));
authRouter.post('/change-password', authenticate, (req, res) => {
  const { current, next } = req.body || {};
  const u = db.prepare('SELECT password_hash FROM users WHERE id=?').get(req.user.id);
  if (!bcrypt.compareSync(String(current || ''), u.password_hash)) throw bad('Current password is wrong');
  if (!next || next.length < 6) throw bad('New password must be at least 6 characters');
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(bcrypt.hashSync(next, 10), req.user.id);
  res.json({ ok: true });
});

// ---------- User accounts (Administrator) ----------
export function createUser({ username, password, role, name, phone, email, student_id }, createdBy) {
  username = String(username || '').trim();
  if (!username || !name || !role) throw bad('Username, name and role are required');
  if (db.prepare('SELECT 1 FROM users WHERE username=? COLLATE NOCASE').get(username)) throw bad(`Username "${username}" is already taken`);
  const pwd = password || genPassword();
  const id = insert(db, 'users', {
    username, role, name, phone: phone || null, email: email || null, student_id: student_id || null,
    password_hash: bcrypt.hashSync(pwd, 10), created_by: createdBy,
  });
  return { id, username, password: pwd, role, name };
}

usersRouter.get('/', allow('admin'), (req, res) => {
  const { role } = req.query;
  const rows = db.prepare(`SELECT u.id, u.username, u.role, u.name, u.phone, u.email, u.active, u.student_id, u.created_at,
      s.admission_no, s.class, s.section FROM users u LEFT JOIN students s ON s.id=u.student_id
      ${role ? 'WHERE u.role=?' : ''} ORDER BY u.role, u.name`).all(...(role ? [role] : []));
  res.json(rows);
});
// Staff list for dropdowns (e.g. assigning drivers); available to staff.
usersRouter.get('/staff', allow('admin', 'accountant', 'teacher', 'librarian', 'driver'), (req, res) => {
  res.json(db.prepare(`SELECT id, name, role, username FROM users WHERE role IN ('admin','accountant','teacher','driver','librarian') AND active=1 ORDER BY name`).all());
});
usersRouter.post('/', allow('admin'), (req, res) => {
  if (['student', 'parent'].includes(req.body.role)) throw bad('Create student and parent logins from the Students page');
  res.json(createUser(req.body, req.user.id));
});
usersRouter.put('/:id', allow('admin'), (req, res) => {
  const data = pick(req.body, ['name', 'phone', 'email', 'active']);
  if (Number(req.params.id) === req.user.id && data.active === 0) throw bad('You cannot disable your own account');
  if (!update(db, 'users', req.params.id, data)) throw notFound('User');
  res.json({ ok: true });
});
usersRouter.post('/:id/reset-password', allow('admin', 'teacher'), (req, res) => {
  const u = db.prepare('SELECT role FROM users WHERE id=?').get(req.params.id);
  if (!u) throw notFound('User');
  if (req.user.role === 'teacher' && !isFamily(u)) throw bad('Teachers can only reset student / parent passwords');
  const pwd = req.body.password || genPassword();
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(bcrypt.hashSync(pwd, 10), req.params.id);
  res.json({ password: pwd });
});
usersRouter.delete('/:id', allow('admin'), (req, res) => {
  if (Number(req.params.id) === req.user.id) throw bad('You cannot delete your own account');
  db.prepare('DELETE FROM users WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- Students (Teachers & Administrator) ----------
const STUDENT_FIELDS = ['admission_no', 'name', 'father_name', 'mother_name', 'dob', 'gender', 'blood_group', 'address',
  'class', 'section', 'roll_no', 'mobile', 'email', 'route_no', 'concession_pct', 'photo_url', 'active'];
const STAFF_READ = ['admin', 'teacher', 'accountant', 'librarian', 'driver'];

studentsRouter.get('/', allow(...STAFF_READ), (req, res) => {
  const { class: cls, section, q, route_no } = req.query;
  const where = ['1=1'], args = [];
  if (cls) { where.push('s.class=?'); args.push(cls); }
  if (section) { where.push('s.section=?'); args.push(section); }
  if (route_no) { where.push('s.route_no=?'); args.push(route_no); }
  if (q) { where.push('(s.name LIKE ? OR s.admission_no LIKE ? OR s.father_name LIKE ?)'); args.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (req.user.role === 'teacher') { // teachers see the sections they teach
    const f = teacherRowFilter(req.user, { classCol: 's.class', sectionCol: 's.section' });
    where.push(`(${f.sql} AND s.class IS NOT NULL AND s.class <> '')`); args.push(...f.args);
  }
  res.json(db.prepare(`SELECT s.*,
      (SELECT username FROM users WHERE student_id=s.id AND role='student') AS student_username,
      (SELECT username FROM users WHERE student_id=s.id AND role='parent') AS parent_username
    FROM students s WHERE ${where.join(' AND ')} ORDER BY s.class, s.section, CAST(s.roll_no AS INTEGER), s.name`).all(...args));
});
studentsRouter.get('/classes', allow(...STAFF_READ), (req, res) => {
  res.json(db.prepare('SELECT class, section, COUNT(*) AS count FROM students WHERE active=1 GROUP BY class, section ORDER BY CAST(class AS INTEGER), class, section').all());
});
studentsRouter.get('/me', allow('student', 'parent'), (req, res) => res.json(myStudent(req)));
studentsRouter.get('/:id', allow(...STAFF_READ), (req, res) => {
  const s = db.prepare('SELECT * FROM students WHERE id=?').get(req.params.id);
  if (!s) throw notFound('Student');
  if (req.user.role === 'teacher' && !linkedTo(req.user, s.class, s.section)) throw notFound('Student');
  res.json(s);
});
/** Creates the student record + a student login + a parent login, returning the generated credentials. */
studentsRouter.post('/', allow('teacher'), (req, res) => {
  const data = pick(req.body, STUDENT_FIELDS);
  for (const f of ['admission_no', 'name', 'class', 'section']) if (!data[f]) throw bad(`${f.replace('_', ' ')} is required`);
  requireSection(data.class, data.section);
  requireClassTeacher(req.user, data.class, data.section);
  if (db.prepare('SELECT 1 FROM students WHERE admission_no=?').get(data.admission_no)) throw bad('Admission number already exists');
  const out = tx(() => {
    const id = insert(db, 'students', data);
    const student = createUser({ username: data.admission_no, password: req.body.student_password, role: 'student',
      name: data.name, phone: data.mobile, email: data.email, student_id: id }, req.user.id);
    const parent = createUser({ username: `P${data.admission_no}`, password: req.body.parent_password, role: 'parent',
      name: data.father_name || data.mother_name || `Parent of ${data.name}`, phone: data.mobile, student_id: id }, req.user.id);
    return { id, credentials: { student, parent } };
  });
  res.json(out);
});
/** The student, after checking the user is their class teacher (or an administrator). */
function ownStudent(req) {
  const st = db.prepare('SELECT * FROM students WHERE id=?').get(req.params.id);
  if (!st) throw notFound('Student');
  requireClassTeacher(req.user, st.class, st.section);
  return st;
}
studentsRouter.put('/:id', allow('teacher'), (req, res) => {
  const st = ownStudent(req);
  const data = pick(req.body, STUDENT_FIELDS);
  delete data.admission_no; // admission number is the login id; keep it stable
  const cls = data.class ?? st.class, sec = data.section ?? st.section;
  if (cls !== st.class || sec !== st.section) { // moving to another section: it must exist and be theirs too
    requireSection(cls, sec);
    requireClassTeacher(req.user, cls, sec);
  }
  update(db, 'students', st.id, data);
  if (data.name) db.prepare("UPDATE users SET name=? WHERE student_id=? AND role='student'").run(data.name, req.params.id);
  if (data.active !== undefined) db.prepare('UPDATE users SET active=? WHERE student_id=?').run(data.active ? 1 : 0, req.params.id);
  res.json({ ok: true });
});
studentsRouter.post('/:id/reset-password', allow('teacher'), (req, res) => {
  ownStudent(req);
  const role = req.body.role === 'parent' ? 'parent' : 'student';
  const u = db.prepare('SELECT id, username, name FROM users WHERE student_id=? AND role=?').get(req.params.id, role);
  if (!u) throw notFound('Login');
  const pwd = genPassword();
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(bcrypt.hashSync(pwd, 10), u.id);
  res.json({ role, username: u.username, name: u.name, password: pwd });
});
studentsRouter.delete('/:id', allow('teacher'), (req, res) => {
  ownStudent(req);
  tx(() => {
    db.prepare('DELETE FROM users WHERE student_id=?').run(req.params.id);
    for (const i of db.prepare('SELECT book_id FROM book_issues WHERE student_id=? AND return_date IS NULL').all(req.params.id))
      db.prepare('UPDATE books SET available_copies = available_copies + 1 WHERE id=?').run(i.book_id);
    db.prepare('DELETE FROM students WHERE id=?').run(req.params.id);
  });
  res.json({ ok: true });
});
