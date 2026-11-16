import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { db, jwtSecret } from './db.js';

export const ROLES = ['admin', 'ca', 'intern', 'customer'];
export const STAFF = ['admin', 'ca', 'intern'];
export const isStaff = (u) => STAFF.includes(u.role);

export const sign = (u) => jwt.sign({ id: u.id }, jwtSecret(), { expiresIn: '7d' });
export const hash = (pw) => bcrypt.hashSync(pw, 10);
export const DUMMY_HASH = hash('not-a-real-password');

export function authenticate(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not logged in' });
  try {
    const { id } = jwt.verify(token, jwtSecret());
    const u = db.prepare('SELECT id, username, role, name, phone, email, client_id, active FROM users WHERE id=?').get(id);
    if (!u || !u.active) return res.status(401).json({ error: 'Account disabled' });
    req.user = u;
    next();
  } catch { res.status(401).json({ error: 'Session expired, please log in again' }); }
}

export const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'You do not have permission for this action' });
export const staffOnly = requireRole(...STAFF);
export const adminOnly = requireRole('admin');

/** Customers are always limited to their own organisation. Returns the client id, or null for staff. */
export function scopeClient(req) {
  if (req.user.role !== 'customer') return null;
  if (!req.user.client_id) { const e = new Error('Your login is not linked to an organisation'); e.status = 403; throw e; }
  return req.user.client_id;
}

// Simple in-memory brake on password guessing: 8 failures per 15 minutes per username+IP.
const fails = new Map();
const WINDOW = 15 * 60 * 1000;
export function loginBlocked(key) {
  const f = (fails.get(key) || []).filter((t) => Date.now() - t < WINDOW);
  fails.set(key, f);
  return f.length >= 8;
}
export const loginFailed = (key) => fails.set(key, [...(fails.get(key) || []), Date.now()]);
export const loginOk = (key) => fails.delete(key);
