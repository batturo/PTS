import jwt from 'jsonwebtoken';
import { db, setting } from './db.js';

const SECRET = () => process.env.JWT_SECRET || setting('_jwt_secret');
export const STAFF = ['admin', 'accountant', 'teacher', 'driver', 'librarian'];

export const sign = (u) => jwt.sign({ id: u.id, role: u.role }, SECRET(), { expiresIn: '7d' });

export function authenticate(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not logged in' });
  try {
    const { id } = jwt.verify(token, SECRET());
    const u = db.prepare('SELECT id, username, role, name, phone, email, student_id, active FROM users WHERE id=?').get(id);
    if (!u || !u.active) return res.status(401).json({ error: 'Account disabled' });
    req.user = u;
    next();
  } catch { res.status(401).json({ error: 'Session expired, please log in again' }); }
}

// Administrators can use every staff feature, but never act as a student/parent.
export const allow = (...roles) => (req, res, next) => {
  const r = req.user.role;
  if (roles.includes(r) || (r === 'admin' && roles.some(x => STAFF.includes(x)))) return next();
  res.status(403).json({ error: 'You do not have permission for this action' });
};

export const isFamily = (u) => u.role === 'student' || u.role === 'parent';

/** The student record a student/parent login is tied to. */
export function myStudent(req) {
  if (!isFamily(req.user)) return null;
  return db.prepare('SELECT * FROM students WHERE id=?').get(req.user.student_id);
}
