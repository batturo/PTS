import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db, audit } from '../db.js';
import { ROLES, sign, hash, authenticate, adminOnly, DUMMY_HASH, loginBlocked, loginFailed, loginOk } from '../auth.js';
import { httpError, need, nul, str } from '../util.js';

export const authRouter = Router();
const PUBLIC = 'id, username, role, name, phone, email, client_id, active, created_at';

authRouter.post('/login', (req, res) => {
  const username = str(req.body.username) || '', password = req.body.password || '';
  const key = `${req.ip}|${username.toLowerCase()}`;
  if (loginBlocked(key)) throw httpError(429, 'Too many failed attempts. Please wait a few minutes and try again.');
  const u = db.prepare('SELECT * FROM users WHERE username=?').get(username);
  const ok = bcrypt.compareSync(password, u ? u.password_hash : DUMMY_HASH);
  if (!u || !ok) { loginFailed(key); throw httpError(401, 'Wrong username or password'); }
  if (!u.active) throw httpError(403, 'This account has been disabled. Please contact the firm.');
  loginOk(key);
  res.json({ token: sign(u), user: userView(u.id) });
});

function userView(id) {
  const u = db.prepare(`SELECT ${PUBLIC} FROM users WHERE id=?`).get(id);
  if (u?.client_id) u.client_name = db.prepare('SELECT name FROM clients WHERE id=?').get(u.client_id)?.name;
  return u;
}
authRouter.get('/me', authenticate, (req, res) => res.json(userView(req.user.id)));
authRouter.post('/change-password', authenticate, (req, res) => {
  const { current_password, new_password } = req.body;
  if (!new_password || new_password.length < 8) throw httpError(400, 'New password must be at least 8 characters');
  const u = db.prepare('SELECT password_hash FROM users WHERE id=?').get(req.user.id);
  if (!bcrypt.compareSync(current_password || '', u.password_hash)) throw httpError(400, 'Current password is wrong');
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hash(new_password), req.user.id);
  audit(req.user, 'change_password', 'user', req.user.id);
  res.json({ ok: true });
});

// ---- Administrator: manage all logins -----------------------------------------------------------
export const usersRouter = Router();
usersRouter.use(adminOnly);

usersRouter.get('/', (req, res) => {
  const w = [], p = [];
  if (req.query.role) { w.push('u.role=?'); p.push(req.query.role); }
  if (req.query.client_id) { w.push('u.client_id=?'); p.push(Number(req.query.client_id)); }
  if (req.query.q) { w.push('(u.name LIKE ? OR u.username LIKE ?)'); p.push(`%${req.query.q}%`, `%${req.query.q}%`); }
  res.json(db.prepare(`SELECT u.id,u.username,u.role,u.name,u.phone,u.email,u.client_id,c.name AS client_name,u.active,u.created_at
    FROM users u LEFT JOIN clients c ON c.id=u.client_id ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY u.role, u.name`).all(...p));
});

export function createUser(body, by) {
  need(body, 'username', 'password', 'role', 'name');
  if (!ROLES.includes(body.role)) throw httpError(400, 'Unknown role');
  if (!/^[A-Za-z0-9._@-]{3,40}$/.test(body.username)) throw httpError(400, 'Username: 3–40 letters, digits or . _ @ -');
  if (body.password.length < 8) throw httpError(400, 'Password must be at least 8 characters');
  let clientId = null;
  if (body.role === 'customer') {
    need(body, 'client_id');
    clientId = Number(body.client_id);
    if (!db.prepare('SELECT 1 FROM clients WHERE id=?').get(clientId)) throw httpError(400, 'Organisation not found');
  }
  const r = db.prepare('INSERT INTO users (username,password_hash,role,name,phone,email,client_id,created_by) VALUES (?,?,?,?,?,?,?,?)')
    .run(str(body.username), hash(body.password), body.role, str(body.name), nul(body.phone), nul(body.email), clientId, by.id);
  audit(by, 'create_user', 'user', r.lastInsertRowid, `${body.role}: ${body.username}`);
  return Number(r.lastInsertRowid);
}
usersRouter.post('/', (req, res) => res.status(201).json(userView(createUser(req.body, req.user))));

usersRouter.put('/:id', (req, res) => {
  const id = Number(req.params.id), b = req.body;
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(id);
  if (!u) throw httpError(404, 'User not found');
  if (id === req.user.id && (b.active === false || b.active === 0 || (b.role && b.role !== u.role))) throw httpError(400, 'You cannot disable or change the role of your own login');
  const role = b.role ?? u.role;
  if (!ROLES.includes(role)) throw httpError(400, 'Unknown role');
  const clientId = role === 'customer' ? Number(b.client_id ?? u.client_id) || null : null;
  if (role === 'customer' && !clientId) throw httpError(400, 'Choose the organisation for this customer login');
  db.prepare('UPDATE users SET name=?, phone=?, email=?, role=?, client_id=?, active=? WHERE id=?')
    .run(str(b.name ?? u.name), nul(b.phone ?? u.phone), nul(b.email ?? u.email), role, clientId, b.active === undefined ? u.active : b.active ? 1 : 0, id);
  audit(req.user, 'update_user', 'user', id, `${u.username}${b.active === false ? ' (disabled)' : ''}`);
  res.json(userView(id));
});

usersRouter.post('/:id/reset-password', (req, res) => {
  const pw = req.body.password;
  if (!pw || pw.length < 8) throw httpError(400, 'Password must be at least 8 characters');
  const r = db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hash(pw), Number(req.params.id));
  if (!r.changes) throw httpError(404, 'User not found');
  audit(req.user, 'reset_password', 'user', Number(req.params.id));
  res.json({ ok: true });
});
