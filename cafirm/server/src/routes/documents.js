import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { db, audit, UPLOAD_DIR } from '../db.js';
import { scopeClient } from '../auth.js';
import { httpError, need, nul, str } from '../util.js';
import { notifyClient } from '../notify.js';

export const documentsRouter = Router();
export const MAX_MB = Number(process.env.MAX_UPLOAD_MB) || 20;
const ALLOWED = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.xls', '.xlsx', '.csv', '.doc', '.docx', '.txt', '.zip', '.json', '.xml']);
export const KINDS = ['compliance_document', 'tax_report', 'filing_acknowledgement', 'registration_document', 'client_upload', 'other'];

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, crypto.randomBytes(16).toString('hex') + path.extname(file.originalname).toLowerCase()),
  }),
  limits: { fileSize: MAX_MB * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => (ALLOWED.has(path.extname(file.originalname).toLowerCase()) ? cb(null, true) : cb(httpError(400, 'This file type is not allowed (use PDF, image, Excel, Word, CSV, ZIP or text)'))),
});

const SELECT = `SELECT d.id,d.client_id,c.name AS client_name,d.filing_id,d.request_id,d.title,d.kind,d.original_name,d.mime,d.size,d.visible_to_client,d.created_at,d.uploaded_by,u.name AS uploaded_by_name,u.role AS uploaded_by_role,
  COALESCE(f.name,t.name) AS filing_name,f.period_label
  FROM documents d JOIN clients c ON c.id=d.client_id JOIN users u ON u.id=d.uploaded_by LEFT JOIN filings f ON f.id=d.filing_id LEFT JOIN templates t ON t.id=f.template_id`;

documentsRouter.get('/', (req, res) => {
  const own = scopeClient(req), w = [], p = [], q = req.query;
  if (own) { w.push('d.client_id=?', 'd.visible_to_client=1'); p.push(own); } else if (q.client_id) { w.push('d.client_id=?'); p.push(Number(q.client_id)); }
  if (q.filing_id) { w.push('d.filing_id=?'); p.push(Number(q.filing_id)); }
  if (q.request_id) { w.push('d.request_id=?'); p.push(Number(q.request_id)); }
  if (q.kind) { w.push('d.kind=?'); p.push(q.kind); }
  if (q.q) { w.push('(d.title LIKE ? OR d.original_name LIKE ?)'); p.push(`%${q.q}%`, `%${q.q}%`); }
  res.json(db.prepare(`${SELECT} ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY d.id DESC LIMIT 1000`).all(...p));
});

// Staff upload for any client; customers may only upload (e.g. requested papers) for their own organisation.
documentsRouter.post('/', upload.single('file'), (req, res) => {
  const file = req.file;
  try {
    if (!file) throw httpError(400, 'Choose a file to upload');
    const b = req.body, customer = req.user.role === 'customer';
    const clientId = scopeClient(req) ?? Number(b.client_id);
    if (!clientId || !db.prepare('SELECT 1 FROM clients WHERE id=?').get(clientId)) throw httpError(400, 'Choose the organisation this document belongs to');
    const filingId = b.filing_id ? Number(b.filing_id) : null, requestId = b.request_id ? Number(b.request_id) : null;
    const f = filingId && db.prepare('SELECT * FROM filings WHERE id=?').get(filingId);
    if (filingId && (!f || f.client_id !== clientId)) throw httpError(400, 'That filing does not belong to this organisation');
    if (requestId && !db.prepare('SELECT 1 FROM registration_requests WHERE id=? AND client_id=?').get(requestId, clientId)) throw httpError(400, 'That request does not belong to this organisation');
    const kind = customer ? 'client_upload' : KINDS.includes(b.kind) ? b.kind : 'other';
    const visible = customer ? 1 : b.visible_to_client === '0' || b.visible_to_client === 'false' ? 0 : 1;
    const title = str(b.title) || path.parse(Buffer.from(file.originalname, 'latin1').toString('utf8')).name;
    const original = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const r = db.prepare('INSERT INTO documents (client_id,filing_id,request_id,title,kind,original_name,stored_name,mime,size,visible_to_client,uploaded_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
      .run(clientId, filingId, requestId, title, kind, original, file.filename, file.mimetype, file.size, visible, req.user.id);
    audit(req.user, 'upload_document', 'document', r.lastInsertRowid, `${title} (${original})`);
    if (!customer && visible && b.notify !== '0' && b.notify !== 'false')
      notifyClient(clientId, { title: `New document: ${title}`, body: f ? `Related to ${f.name ?? ''}`.trim() : null, filing_id: filingId, request_id: requestId, sender_id: req.user.id });
    res.status(201).json(db.prepare(`${SELECT} WHERE d.id=?`).get(r.lastInsertRowid));
  } catch (e) { if (file) fs.rmSync(file.path, { force: true }); throw e; }
});

function find(req) {
  const own = scopeClient(req);
  const d = db.prepare('SELECT * FROM documents WHERE id=?').get(Number(req.params.id));
  if (!d || (own && (d.client_id !== own || !d.visible_to_client))) throw httpError(404, 'Document not found');
  return d;
}
documentsRouter.get('/:id/download', (req, res) => {
  const d = find(req);
  const p = path.join(UPLOAD_DIR, d.stored_name);
  if (!fs.existsSync(p)) throw httpError(404, 'The file is missing from storage');
  audit(req.user, 'download_document', 'document', d.id, d.original_name);
  res.set('X-Content-Type-Options', 'nosniff');
  res.download(p, d.original_name);
});

documentsRouter.patch('/:id', (req, res) => {
  const d = find(req);
  if (req.user.role === 'customer') throw httpError(403, 'You do not have permission for this action');
  db.prepare('UPDATE documents SET title=?, kind=?, visible_to_client=? WHERE id=?')
    .run(str(req.body.title) || d.title, KINDS.includes(req.body.kind) ? req.body.kind : d.kind, req.body.visible_to_client === undefined ? d.visible_to_client : req.body.visible_to_client ? 1 : 0, d.id);
  res.json(db.prepare(`${SELECT} WHERE d.id=?`).get(d.id));
});

documentsRouter.delete('/:id', (req, res) => {
  const d = find(req);
  const ok = req.user.role === 'admin' || d.uploaded_by === req.user.id;
  if (!ok) throw httpError(403, 'Only the Administrator or the person who uploaded a document can delete it');
  db.prepare('DELETE FROM documents WHERE id=?').run(d.id);
  fs.rmSync(path.join(UPLOAD_DIR, d.stored_name), { force: true });
  audit(req.user, 'delete_document', 'document', d.id, d.original_name);
  res.json({ ok: true });
});
