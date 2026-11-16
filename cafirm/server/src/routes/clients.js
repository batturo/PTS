import { Router } from 'express';
import { db, tx, audit } from '../db.js';
import { adminOnly, staffOnly, scopeClient } from '../auth.js';
import { httpError, need, nul, str, today, CLOSED } from '../util.js';
import { generateFilings, currentFY } from '../compliance.js';
import { createUser } from './users.js';

export const clientsRouter = Router();
const flag = (v) => (v ? 1 : 0);

const LIST = `SELECT c.*, e.name AS entity_name,
  (SELECT COUNT(*) FROM filings f WHERE f.client_id=c.id AND f.due_date<? AND f.status NOT IN ('filed','not_applicable')) AS overdue,
  (SELECT COUNT(*) FROM filings f WHERE f.client_id=c.id AND f.status NOT IN ('filed','not_applicable')) AS open_filings,
  (SELECT COUNT(*) FROM users u WHERE u.client_id=c.id AND u.active=1) AS logins
  FROM clients c LEFT JOIN entity_types e ON e.code=c.entity_type`;

// The customer's own organisation.
clientsRouter.get('/mine', (req, res) => {
  const id = scopeClient(req);
  if (!id) throw httpError(400, 'Only customers have an organisation of their own');
  const c = db.prepare(`SELECT c.id,c.name,c.entity_type,e.name AS entity_name,c.pan,c.gstin,c.cin,c.email,c.phone,c.address,c.gst_registered,c.has_employees,c.tds_applicable
    FROM clients c LEFT JOIN entity_types e ON e.code=c.entity_type WHERE c.id=?`).get(id);
  res.json(c);
});

clientsRouter.get('/', staffOnly, (req, res) => {
  const w = [], p = [today()];
  if (req.query.q) { w.push('(c.name LIKE ? OR c.pan LIKE ? OR c.gstin LIKE ?)'); p.push(...Array(3).fill(`%${req.query.q}%`)); }
  if (req.query.entity_type) { w.push('c.entity_type=?'); p.push(req.query.entity_type); }
  if (req.query.active !== undefined) { w.push('c.active=?'); p.push(req.query.active === '1' ? 1 : 0); }
  res.json(db.prepare(`${LIST} ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY c.name`).all(...p));
});

clientsRouter.get('/:id', staffOnly, (req, res) => {
  const c = db.prepare(`${LIST} WHERE c.id=?`).get(today(), Number(req.params.id));
  if (!c) throw httpError(404, 'Organisation not found');
  c.users = db.prepare('SELECT id,username,name,phone,email,active FROM users WHERE client_id=? ORDER BY name').all(c.id);
  res.json(c);
});

function fields(b, existing = {}) {
  const e = { ...existing, ...b };
  if (!db.prepare('SELECT 1 FROM entity_types WHERE code=?').get(e.entity_type)) throw httpError(400, 'Choose a valid type of institution');
  if (e.pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/i.test(e.pan)) throw httpError(400, 'PAN looks wrong (format: ABCDE1234F)');
  if (e.gstin && !/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/i.test(e.gstin)) throw httpError(400, 'GSTIN looks wrong (15 characters)');
  return [str(e.name), e.entity_type, nul(e.pan)?.toUpperCase() ?? null, nul(e.gstin)?.toUpperCase() ?? null, nul(e.cin), nul(e.email), nul(e.phone), nul(e.address),
    flag(e.gst_registered || e.gstin), flag(e.has_employees), flag(e.tds_applicable)];
}

// Administrator creates an organisation, optionally with its first customer login.
clientsRouter.post('/', adminOnly, (req, res) => {
  need(req.body, 'name', 'entity_type');
  const out = tx(() => {
    const r = db.prepare('INSERT INTO clients (name,entity_type,pan,gstin,cin,email,phone,address,gst_registered,has_employees,tds_applicable) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(...fields(req.body));
    const id = Number(r.lastInsertRowid);
    audit(req.user, 'create_client', 'client', id, req.body.name);
    if (req.body.login?.username) createUser({ role: 'customer', name: req.body.name, email: req.body.email, phone: req.body.phone, ...req.body.login, client_id: id }, req.user);
    return { id, filings_created: generateFilings({ clientId: id, fy: currentFY() }) };
  });
  res.status(201).json(out);
});

clientsRouter.put('/:id', adminOnly, (req, res) => {
  const id = Number(req.params.id);
  const old = db.prepare('SELECT * FROM clients WHERE id=?').get(id);
  if (!old) throw httpError(404, 'Organisation not found');
  const vals = fields(req.body, old);
  tx(() => {
    db.prepare('UPDATE clients SET name=?,entity_type=?,pan=?,gstin=?,cin=?,email=?,phone=?,address=?,gst_registered=?,has_employees=?,tds_applicable=?,active=? WHERE id=?')
      .run(...vals, req.body.active === undefined ? old.active : flag(req.body.active), id);
    if (req.body.active === false || req.body.active === 0) db.prepare("UPDATE users SET active=0 WHERE client_id=? AND role='customer'").run(id);
  });
  audit(req.user, 'update_client', 'client', id, old.name);
  // The type of institution or its flags may have changed: add any newly applicable compliances (existing ones are kept).
  res.json({ id, filings_created: generateFilings({ clientId: id, fy: currentFY() }) });
});
