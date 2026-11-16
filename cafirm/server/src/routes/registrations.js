import { Router } from 'express';
import { db, audit } from '../db.js';
import { staffOnly, scopeClient } from '../auth.js';
import { httpError, need, nul, str, REG_STATUSES, STATUS_LABEL } from '../util.js';
import { notifyClient } from '../notify.js';

export const registrationsRouter = Router();
const SELECT = `SELECT r.id,r.client_id,c.name AS client_name,r.type_id,t.name AS type_name,t.category,r.status,r.applicant_notes,r.staff_notes,r.assigned_to,u.name AS assigned_name,r.created_at,r.updated_at
  FROM registration_requests r JOIN clients c ON c.id=r.client_id JOIN registration_types t ON t.id=r.type_id LEFT JOIN users u ON u.id=r.assigned_to`;
const hide = (r, role) => { if (role === 'customer') { delete r.staff_notes; delete r.assigned_to; delete r.assigned_name; } return r; };

registrationsRouter.get('/', (req, res) => {
  const own = scopeClient(req), w = [], p = [];
  if (own) { w.push('r.client_id=?'); p.push(own); } else if (req.query.client_id) { w.push('r.client_id=?'); p.push(Number(req.query.client_id)); }
  if (req.query.status) { w.push('r.status=?'); p.push(req.query.status); }
  if (req.query.open === '1') w.push("r.status NOT IN ('completed','rejected')");
  res.json(db.prepare(`${SELECT} ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY r.updated_at DESC`).all(...p).map((r) => hide(r, req.user.role)));
});

// A customer applies for a new registration; staff may also raise one on a client's behalf.
registrationsRouter.post('/', (req, res) => {
  need(req.body, 'type_id');
  const clientId = scopeClient(req) ?? Number(req.body.client_id);
  if (!clientId || !db.prepare('SELECT 1 FROM clients WHERE id=? AND active=1').get(clientId)) throw httpError(400, 'Choose the organisation');
  const t = db.prepare('SELECT * FROM registration_types WHERE id=? AND active=1').get(Number(req.body.type_id));
  if (!t) throw httpError(400, 'Registration type not found');
  if (db.prepare("SELECT 1 FROM registration_requests WHERE client_id=? AND type_id=? AND status NOT IN ('completed','rejected')").get(clientId, t.id))
    throw httpError(409, 'There is already an open request for this registration');
  const r = db.prepare('INSERT INTO registration_requests (client_id,type_id,applicant_notes,created_by) VALUES (?,?,?,?)').run(clientId, t.id, nul(str(req.body.applicant_notes)), req.user.id);
  audit(req.user, 'create_registration_request', 'registration_request', r.lastInsertRowid, t.name);
  if (req.user.role !== 'customer') notifyClient(clientId, { title: `Registration started: ${t.name}`, request_id: Number(r.lastInsertRowid), sender_id: req.user.id });
  res.status(201).json(hide(db.prepare(`${SELECT} WHERE r.id=?`).get(r.lastInsertRowid), req.user.role));
});

registrationsRouter.patch('/:id', staffOnly, (req, res) => {
  const id = Number(req.params.id), b = req.body;
  const old = db.prepare(`${SELECT} WHERE r.id=?`).get(id);
  if (!old) throw httpError(404, 'Request not found');
  if (b.status !== undefined && !REG_STATUSES.includes(b.status)) throw httpError(400, 'Unknown status');
  const status = b.status ?? old.status;
  db.prepare("UPDATE registration_requests SET status=?, staff_notes=?, assigned_to=?, updated_at=datetime('now') WHERE id=?")
    .run(status, b.staff_notes !== undefined ? nul(str(b.staff_notes)) : old.staff_notes, b.assigned_to !== undefined ? nul(b.assigned_to) : old.assigned_to, id);
  if (b.notify !== false && (status !== old.status || b.message))
    notifyClient(old.client_id, { title: `${old.type_name} – ${STATUS_LABEL[status]}`, body: nul(str(b.message ?? '')), request_id: id, sender_id: req.user.id });
  audit(req.user, 'update_registration_request', 'registration_request', id, `${old.client_name} · ${old.type_name} → ${status}`);
  res.json(db.prepare(`${SELECT} WHERE r.id=?`).get(id));
});
