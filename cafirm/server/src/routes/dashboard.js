import { Router } from 'express';
import { db, audit } from '../db.js';
import { scopeClient, adminOnly } from '../auth.js';
import { today } from '../util.js';
import { isOverdue, daysLeft } from '../compliance.js';

export const dashboardRouter = Router();
const OPEN = "status NOT IN ('filed','not_applicable')";
const plus = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

dashboardRouter.get('/', (req, res) => {
  const own = scopeClient(req), t = today();
  const scope = own ? 'AND client_id=?' : '', sp = own ? [own] : [];
  const n = (sql, ...p) => db.prepare(sql).get(...p).n;
  const stats = {
    overdue: n(`SELECT COUNT(*) n FROM filings WHERE due_date<? AND ${OPEN} ${scope}`, t, ...sp),
    due_soon: n(`SELECT COUNT(*) n FROM filings WHERE due_date>=? AND due_date<=? AND ${OPEN} ${scope}`, t, plus(30), ...sp),
    in_progress: n(`SELECT COUNT(*) n FROM filings WHERE status IN ('in_progress','under_review','awaiting_documents') ${scope}`, ...sp),
    awaiting_documents: n(`SELECT COUNT(*) n FROM filings WHERE status='awaiting_documents' ${scope}`, ...sp),
    filed: n(`SELECT COUNT(*) n FROM filings WHERE status='filed' ${scope}`, ...sp),
    open_registrations: n(`SELECT COUNT(*) n FROM registration_requests WHERE status NOT IN ('completed','rejected') ${own ? 'AND client_id=?' : ''}`, ...sp),
  };
  if (!own) stats.clients = n('SELECT COUNT(*) n FROM clients WHERE active=1');
  const upcoming = db.prepare(`SELECT f.id,f.client_id,c.name AS client_name,COALESCE(f.name,t.name) AS name,COALESCE(f.category,t.category) AS category,f.period_label,f.due_date,f.status
    FROM filings f JOIN clients c ON c.id=f.client_id LEFT JOIN templates t ON t.id=f.template_id
    WHERE f.${OPEN} ${own ? 'AND f.client_id=?' : ''} ORDER BY f.due_date LIMIT 10`).all(...sp)
    .map((f) => ({ ...f, overdue: isOverdue(f), days_left: daysLeft(f.due_date) }));
  const out = { stats, upcoming, unread: n('SELECT COUNT(*) n FROM notifications WHERE user_id=? AND read_at IS NULL', req.user.id) };
  if (!own) out.recent_activity = db.prepare('SELECT a.action,a.detail,a.at,u.name AS user_name FROM audit_log a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 8').all();
  res.json(out);
});

export const auditRouter = Router();
auditRouter.use(adminOnly);
auditRouter.get('/', (req, res) => {
  const w = [], p = [];
  if (req.query.user_id) { w.push('a.user_id=?'); p.push(Number(req.query.user_id)); }
  if (req.query.q) { w.push('(a.detail LIKE ? OR a.action LIKE ?)'); p.push(`%${req.query.q}%`, `%${req.query.q}%`); }
  const limit = Math.min(Number(req.query.limit) || 200, 1000);
  res.json(db.prepare(`SELECT a.id,a.action,a.entity,a.entity_id,a.detail,a.at,u.name AS user_name,u.role AS user_role FROM audit_log a LEFT JOIN users u ON u.id=a.user_id ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY a.id DESC LIMIT ${limit}`).all(...p));
});
