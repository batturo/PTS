import { Router } from 'express';
import { db, audit } from '../db.js';
import { staffOnly, requireRole } from '../auth.js';
import { httpError, need, nul, str } from '../util.js';
import { notifyClient } from '../notify.js';

export const notificationsRouter = Router();

// ---- Customer inbox ---------------------------------------------------------------------------
notificationsRouter.get('/', requireRole('customer'), (req, res) => {
  res.json(db.prepare(`SELECT n.id,n.title,n.body,n.filing_id,n.request_id,n.created_at,n.read_at,u.name AS from_name
    FROM notifications n LEFT JOIN users u ON u.id=n.sender_id WHERE n.user_id=? ${req.query.unread === '1' ? 'AND n.read_at IS NULL' : ''} ORDER BY n.id DESC LIMIT 200`).all(req.user.id));
});
notificationsRouter.get('/unread-count', (req, res) => res.json({ count: db.prepare('SELECT COUNT(*) n FROM notifications WHERE user_id=? AND read_at IS NULL').get(req.user.id).n }));
notificationsRouter.post('/read-all', (req, res) => { db.prepare("UPDATE notifications SET read_at=datetime('now') WHERE user_id=? AND read_at IS NULL").run(req.user.id); res.json({ ok: true }); });
notificationsRouter.post('/:id/read', (req, res) => { db.prepare("UPDATE notifications SET read_at=COALESCE(read_at,datetime('now')) WHERE id=? AND user_id=?").run(Number(req.params.id), req.user.id); res.json({ ok: true }); });

// ---- Staff: send messages to customers ---------------------------------------------------------
// audience: { client_ids: [..] } | { entity_type } | { all: true }
notificationsRouter.post('/send', staffOnly, (req, res) => {
  const b = req.body;
  need(b, 'title');
  let ids;
  if (Array.isArray(b.client_ids) && b.client_ids.length) ids = b.client_ids.map(Number);
  else if (b.entity_type) ids = db.prepare('SELECT id FROM clients WHERE active=1 AND entity_type=?').all(b.entity_type).map((r) => r.id);
  else if (b.all) ids = db.prepare('SELECT id FROM clients WHERE active=1').all().map((r) => r.id);
  else throw httpError(400, 'Choose who should receive this message');
  if (b.filing_id && !db.prepare('SELECT 1 FROM filings WHERE id=?').get(Number(b.filing_id))) throw httpError(400, 'Filing not found');
  let people = 0;
  for (const id of ids) people += notifyClient(id, { title: str(b.title), body: nul(str(b.body)), filing_id: b.filing_id ? Number(b.filing_id) : null, sender_id: req.user.id });
  audit(req.user, 'send_notification', 'notification', null, `${b.title} → ${ids.length} organisation(s)`);
  res.status(201).json({ organisations: ids.length, people });
});

notificationsRouter.get('/sent', staffOnly, (req, res) => {
  const own = req.user.role === 'admin' && req.query.all === '1' ? '' : 'WHERE n.sender_id=?';
  res.json(db.prepare(`SELECT MIN(n.id) id, n.client_id, c.name AS client_name, n.title, n.body, n.filing_id, n.created_at, u.name AS from_name, COUNT(*) AS recipients, SUM(n.read_at IS NOT NULL) AS read_count
    FROM notifications n JOIN clients c ON c.id=n.client_id LEFT JOIN users u ON u.id=n.sender_id ${own}
    GROUP BY n.client_id, n.title, n.created_at, n.sender_id ORDER BY MIN(n.id) DESC LIMIT 200`).all(...(own ? [req.user.id] : [])));
});
