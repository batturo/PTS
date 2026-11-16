import { Router } from 'express';
import { db, tx, audit } from '../db.js';
import { adminOnly, staffOnly, scopeClient } from '../auth.js';
import { httpError, need, nul, str, today, isDate, CLOSED, FILING_STATUSES, STATUS_LABEL } from '../util.js';
import { generateFilings, currentFY, validFY, isOverdue, daysLeft } from '../compliance.js';
import { notifyClient } from '../notify.js';

export const filingsRouter = Router();

const SELECT = `SELECT f.id,f.client_id,c.name AS client_name,f.template_id,COALESCE(f.name,t.name) AS name,COALESCE(f.category,t.category,'Other') AS category,
  t.form_no,t.frequency,f.fy,f.period_label,f.due_date,f.status,f.filed_on,f.ack_no,f.remarks,f.internal_notes,f.assigned_to,u.name AS assigned_name,f.updated_at
  FROM filings f JOIN clients c ON c.id=f.client_id LEFT JOIN templates t ON t.id=f.template_id LEFT JOIN users u ON u.id=f.assigned_to`;

function present(f, role) {
  f.overdue = isOverdue(f);
  f.days_left = daysLeft(f.due_date);
  if (role === 'customer') { delete f.internal_notes; delete f.assigned_to; delete f.assigned_name; }
  return f;
}

filingsRouter.get('/', (req, res) => {
  const q = req.query, w = [], p = [];
  const own = scopeClient(req);
  if (own) { w.push('f.client_id=?'); p.push(own); } else if (q.client_id) { w.push('f.client_id=?'); p.push(Number(q.client_id)); }
  if (q.fy) { w.push('f.fy=?'); p.push(q.fy); }
  if (q.status) { w.push('f.status=?'); p.push(q.status); }
  if (q.category) { w.push('COALESCE(f.category,t.category)=?'); p.push(q.category); }
  if (q.assigned_to) { w.push('f.assigned_to=?'); p.push(Number(q.assigned_to)); }
  if (q.overdue === '1') { w.push("f.due_date<? AND f.status NOT IN ('filed','not_applicable')"); p.push(today()); }
  if (q.open === '1') w.push("f.status NOT IN ('filed','not_applicable')");
  if (q.from) { w.push('f.due_date>=?'); p.push(q.from); }
  if (q.to) { w.push('f.due_date<=?'); p.push(q.to); }
  if (q.q) { w.push('(COALESCE(f.name,t.name) LIKE ? OR c.name LIKE ? OR f.period_label LIKE ?)'); p.push(...Array(3).fill(`%${q.q}%`)); }
  const limit = Math.min(Number(q.limit) || 500, 2000);
  res.json(db.prepare(`${SELECT} ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY f.due_date, c.name LIMIT ${limit}`).all(...p).map((f) => present(f, req.user.role)));
});

function load(req) {
  const f = db.prepare(`${SELECT} WHERE f.id=?`).get(Number(req.params.id));
  const own = scopeClient(req);
  if (!f || (own && f.client_id !== own)) throw httpError(404, 'Filing not found');
  return f;
}

filingsRouter.get('/:id', (req, res) => {
  const f = present(load(req), req.user.role);
  f.history = db.prepare(`SELECT h.id,h.from_status,h.to_status,h.note,h.at,u.name AS by_name FROM filing_history h LEFT JOIN users u ON u.id=h.user_id WHERE h.filing_id=? ORDER BY h.id DESC`).all(f.id);
  f.documents = db.prepare(`SELECT id,title,kind,original_name,size,created_at FROM documents WHERE filing_id=? ${req.user.role === 'customer' ? 'AND visible_to_client=1' : ''} ORDER BY id DESC`).all(f.id);
  res.json(f);
});

// CAs and interns update status & details; only the Administrator may change due dates or rename a filing.
filingsRouter.patch('/:id', staffOnly, (req, res) => {
  const f = load(req), b = req.body, admin = req.user.role === 'admin';
  const old = db.prepare('SELECT * FROM filings WHERE id=?').get(f.id);
  if (b.status !== undefined && !FILING_STATUSES.includes(b.status)) throw httpError(400, 'Unknown status');
  if ((b.due_date !== undefined || b.name !== undefined || b.category !== undefined) && !admin) throw httpError(403, 'Only the Administrator can change due dates');
  if (b.due_date !== undefined && !isDate(b.due_date)) throw httpError(400, 'Due date must be a valid date');
  if (b.filed_on && !isDate(b.filed_on)) throw httpError(400, 'Filed-on must be a valid date');
  if (b.assigned_to) { const a = db.prepare("SELECT 1 FROM users WHERE id=? AND role IN ('admin','ca','intern') AND active=1").get(Number(b.assigned_to)); if (!a) throw httpError(400, 'Assignee not found'); }

  const next = {
    status: b.status ?? old.status,
    remarks: b.remarks !== undefined ? nul(str(b.remarks)) : old.remarks,
    internal_notes: b.internal_notes !== undefined ? nul(str(b.internal_notes)) : old.internal_notes,
    filed_on: b.filed_on !== undefined ? nul(b.filed_on) : old.filed_on,
    ack_no: b.ack_no !== undefined ? nul(str(b.ack_no)) : old.ack_no,
    assigned_to: b.assigned_to !== undefined ? nul(b.assigned_to) : old.assigned_to,
    due_date: b.due_date ?? old.due_date,
    name: old.template_id ? old.name : b.name ?? old.name,
    category: old.template_id ? old.category : b.category ?? old.category,
  };
  if (next.status === 'filed' && !next.filed_on) next.filed_on = today();
  if (next.status !== 'filed') next.filed_on = b.filed_on !== undefined ? next.filed_on : null;

  const statusChanged = next.status !== old.status, dueChanged = next.due_date !== old.due_date;
  tx(() => {
    db.prepare(`UPDATE filings SET status=?,remarks=?,internal_notes=?,filed_on=?,ack_no=?,assigned_to=?,due_date=?,name=?,category=?,updated_by=?,updated_at=datetime('now') WHERE id=?`)
      .run(next.status, next.remarks, next.internal_notes, next.filed_on, next.ack_no, next.assigned_to, next.due_date, next.name, next.category, req.user.id, f.id);
    if (statusChanged || b.note) db.prepare('INSERT INTO filing_history (filing_id,user_id,from_status,to_status,note) VALUES (?,?,?,?,?)').run(f.id, req.user.id, old.status, next.status, nul(str(b.note ?? '')));
    if (b.notify !== false && (statusChanged || dueChanged || b.message)) {
      const what = statusChanged ? `Status: ${STATUS_LABEL[next.status]}` : dueChanged ? `New due date: ${next.due_date}` : 'Update';
      notifyClient(f.client_id, { title: `${f.name} (${f.period_label}) – ${what}`, body: nul(str(b.message ?? '')) || (statusChanged && next.ack_no ? `Acknowledgement no. ${next.ack_no}` : null), filing_id: f.id, sender_id: req.user.id });
    }
  });
  audit(req.user, 'update_filing', 'filing', f.id, `${f.client_name} · ${f.name} ${f.period_label}${statusChanged ? ` → ${next.status}` : ''}${dueChanged ? ` due ${next.due_date}` : ''}`);
  res.json(present(db.prepare(`${SELECT} WHERE f.id=?`).get(f.id), req.user.role));
});

// Administrator: add a one-off filing for a client, generate the year's filings, or delete a filing.
filingsRouter.post('/', adminOnly, (req, res) => {
  const b = req.body;
  need(b, 'client_id', 'name', 'due_date');
  if (!isDate(b.due_date)) throw httpError(400, 'Due date must be a valid date');
  if (!db.prepare('SELECT 1 FROM clients WHERE id=?').get(Number(b.client_id))) throw httpError(400, 'Organisation not found');
  const fy = b.fy || currentFY();
  const r = db.prepare('INSERT INTO filings (client_id,name,category,fy,period_label,due_date,remarks,assigned_to) VALUES (?,?,?,?,?,?,?,?)')
    .run(Number(b.client_id), str(b.name), str(b.category) || 'Other', fy, str(b.period_label) || 'One-time', b.due_date, nul(str(b.remarks)), nul(b.assigned_to));
  audit(req.user, 'create_filing', 'filing', r.lastInsertRowid, b.name);
  res.status(201).json({ id: Number(r.lastInsertRowid) });
});

filingsRouter.post('/generate', adminOnly, (req, res) => {
  const fy = req.body.fy || currentFY();
  if (!validFY(fy)) throw httpError(400, 'Financial year must look like 2026-27');
  const created = generateFilings({ fy, clientId: req.body.client_id ? Number(req.body.client_id) : undefined });
  audit(req.user, 'generate_filings', 'filing', null, `FY ${fy}: ${created} created`);
  res.json({ created });
});

filingsRouter.delete('/:id', adminOnly, (req, res) => {
  const f = load(req);
  db.prepare('DELETE FROM filings WHERE id=?').run(f.id);
  audit(req.user, 'delete_filing', 'filing', f.id, `${f.client_name} · ${f.name} ${f.period_label}`);
  res.json({ ok: true });
});
