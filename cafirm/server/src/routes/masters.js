import { Router } from 'express';
import { db, tx, audit } from '../db.js';
import { adminOnly, staffOnly } from '../auth.js';
import { httpError, need, nul, str, isDate } from '../util.js';
import { entitiesOf, generateFilings, recomputeDueDates, periodsFor, currentFY, validFY } from '../compliance.js';
import { notifyClient } from '../notify.js';

export const mastersRouter = Router();

// Active staff, so CAs and interns can assign work to each other.
mastersRouter.get('/staff', staffOnly, (req, res) => res.json(db.prepare("SELECT id,name,role FROM users WHERE role IN ('admin','ca','intern') AND active=1 ORDER BY name").all()));
mastersRouter.get('/entity-types', (req, res) => res.json(db.prepare('SELECT code,name FROM entity_types ORDER BY sort').all()));

// ---- Compliance templates (what each type of institution must file) ------------------------------
const view = (t) => ({ ...t, schedule: t.schedule ? JSON.parse(t.schedule) : null, entities: entitiesOf(t.id) });
mastersRouter.get('/templates', staffOnly, (req, res) => {
  res.json(db.prepare('SELECT * FROM templates ORDER BY category, name').all().map(view));
});

function cleanTemplate(b) {
  need(b, 'name', 'category', 'frequency');
  if (!['monthly', 'quarterly', 'half_yearly', 'annual', 'custom'].includes(b.frequency)) throw httpError(400, 'Unknown frequency');
  if (!['', 'gst', 'employees', 'tds'].includes(b.condition || '')) throw httpError(400, 'Unknown condition');
  const periodic = ['monthly', 'quarterly'].includes(b.frequency);
  let schedule = null;
  if (periodic) {
    const d = Number(b.due_day);
    if (!(d >= 1 && d <= 31)) throw httpError(400, 'Due day must be between 1 and 31');
  } else {
    const list = Array.isArray(b.schedule) ? b.schedule : [];
    if (!list.length) throw httpError(400, 'Add at least one due date');
    for (const e of list) if (!(e.month >= 1 && e.month <= 12 && e.day >= 1 && e.day <= 31)) throw httpError(400, 'Each due date needs a valid month and day');
    schedule = JSON.stringify(list.map((e) => ({ label: str(e.label) || '', month: Number(e.month), day: Number(e.day), year_offset: Number(e.year_offset ?? 1) })));
  }
  if (!Array.isArray(b.entities) || !b.entities.length) throw httpError(400, 'Choose at least one type of institution');
  for (const e of b.entities) if (!db.prepare('SELECT 1 FROM entity_types WHERE code=?').get(e)) throw httpError(400, `Unknown institution type ${e}`);
  return [str(b.name), str(b.category), nul(str(b.form_no)), nul(str(b.description)), b.frequency, periodic ? Number(b.due_day) : null, periodic ? Number(b.due_offset_months ?? 1) : null, schedule, b.condition || '', b.active === false ? 0 : 1];
}
const setEntities = (id, ents) => { db.prepare('DELETE FROM template_entities WHERE template_id=?').run(id); for (const e of ents) db.prepare('INSERT INTO template_entities (template_id,entity_type) VALUES (?,?)').run(id, e); };

mastersRouter.post('/templates', adminOnly, (req, res) => {
  const vals = cleanTemplate(req.body);
  const id = tx(() => {
    const r = db.prepare('INSERT INTO templates (name,category,form_no,description,frequency,due_day,due_offset_months,schedule,condition,active) VALUES (?,?,?,?,?,?,?,?,?,?)').run(...vals);
    setEntities(r.lastInsertRowid, req.body.entities);
    return Number(r.lastInsertRowid);
  });
  const created = generateFilings({ templateId: id, fy: currentFY() }); // existing customers pick the new compliance up straight away
  audit(req.user, 'create_template', 'template', id, req.body.name);
  res.status(201).json({ ...view(db.prepare('SELECT * FROM templates WHERE id=?').get(id)), filings_created: created });
});

mastersRouter.put('/templates/:id', adminOnly, (req, res) => {
  const id = Number(req.params.id);
  if (!db.prepare('SELECT 1 FROM templates WHERE id=?').get(id)) throw httpError(404, 'Compliance not found');
  const vals = cleanTemplate(req.body);
  tx(() => { db.prepare('UPDATE templates SET name=?,category=?,form_no=?,description=?,frequency=?,due_day=?,due_offset_months=?,schedule=?,condition=?,active=? WHERE id=?').run(...vals, id); setEntities(id, req.body.entities); });
  const moved = recomputeDueDates(id);
  const created = generateFilings({ templateId: id, fy: currentFY() });
  audit(req.user, 'update_template', 'template', id, `${req.body.name} (${moved} due dates moved, ${created} filings added)`);
  res.json({ ...view(db.prepare('SELECT * FROM templates WHERE id=?').get(id)), due_dates_updated: moved, filings_created: created });
});

mastersRouter.delete('/templates/:id', adminOnly, (req, res) => {
  const id = Number(req.params.id);
  const used = db.prepare('SELECT COUNT(*) n FROM filings WHERE template_id=?').get(id).n;
  if (used) { db.prepare('UPDATE templates SET active=0 WHERE id=?').run(id); audit(req.user, 'deactivate_template', 'template', id); return res.json({ deactivated: true }); }
  db.prepare('DELETE FROM templates WHERE id=?').run(id);
  audit(req.user, 'delete_template', 'template', id);
  res.json({ deleted: true });
});

// ---- Due dates that change for every customer at once (e.g. a government extension) --------------
mastersRouter.get('/templates/:id/due-dates', staffOnly, (req, res) => {
  const id = Number(req.params.id), fy = req.query.fy || currentFY();
  if (!validFY(fy)) throw httpError(400, 'Financial year must look like 2026-27');
  const t = db.prepare('SELECT * FROM templates WHERE id=?').get(id);
  if (!t) throw httpError(404, 'Compliance not found');
  const ov = new Map(db.prepare('SELECT * FROM due_overrides WHERE template_id=? AND fy=?').all(id, fy).map((o) => [o.period_label, o]));
  res.json(periodsFor(t, fy).map((p) => ({ period_label: p.label, standard_due: p.due, due_date: ov.get(p.label)?.due_date || p.due, overridden: ov.has(p.label), reason: ov.get(p.label)?.reason || null,
    customers: db.prepare("SELECT COUNT(*) n FROM filings WHERE template_id=? AND fy=? AND period_label=? AND status NOT IN ('filed','not_applicable')").get(id, fy, p.label).n })));
});

mastersRouter.put('/templates/:id/due-dates', adminOnly, (req, res) => {
  const id = Number(req.params.id), { fy, period_label, due_date, reason, notify } = req.body;
  need(req.body, 'fy', 'period_label', 'due_date');
  if (!validFY(fy) || !isDate(due_date)) throw httpError(400, 'Check the financial year and date');
  const t = db.prepare('SELECT * FROM templates WHERE id=?').get(id);
  if (!t) throw httpError(404, 'Compliance not found');
  if (!periodsFor(t, fy).some((p) => p.label === period_label)) throw httpError(400, 'That period does not exist for this compliance');
  const out = tx(() => {
    db.prepare('INSERT INTO due_overrides (template_id,fy,period_label,due_date,reason) VALUES (?,?,?,?,?) ON CONFLICT(template_id,fy,period_label) DO UPDATE SET due_date=excluded.due_date, reason=excluded.reason')
      .run(id, fy, period_label, due_date, nul(str(reason)));
    const rows = db.prepare("SELECT id, client_id FROM filings WHERE template_id=? AND fy=? AND period_label=? AND status NOT IN ('filed','not_applicable') AND due_date<>?").all(id, fy, period_label, due_date);
    db.prepare("UPDATE filings SET due_date=?, updated_at=datetime('now') WHERE template_id=? AND fy=? AND period_label=? AND status NOT IN ('filed','not_applicable')").run(due_date, id, fy, period_label);
    let notified = 0;
    if (notify) for (const c of new Set(rows.map((r) => r.client_id)))
      notified += notifyClient(c, { title: `Due date changed: ${t.name} (${period_label})`, body: `New due date: ${due_date}${reason ? ` – ${reason}` : ''}`, filing_id: rows.find((r) => r.client_id === c).id, sender_id: req.user.id });
    return { filings_updated: rows.length, notified };
  });
  audit(req.user, 'set_due_date', 'template', id, `${t.name} ${period_label} FY ${fy} → ${due_date} (${out.filings_updated} filings)`);
  res.json(out);
});

mastersRouter.delete('/templates/:id/due-dates', adminOnly, (req, res) => {
  const id = Number(req.params.id), { fy, period_label } = req.body;
  db.prepare('DELETE FROM due_overrides WHERE template_id=? AND fy=? AND period_label=?').run(id, fy, period_label);
  const moved = recomputeDueDates(id);
  audit(req.user, 'reset_due_date', 'template', id, `${period_label} FY ${fy}`);
  res.json({ filings_updated: moved });
});

// ---- Registration types (company registrations & licences the firm offers) -----------------------
mastersRouter.get('/registration-types', (req, res) => {
  const all = req.user.role !== 'customer' && req.query.all === '1';
  res.json(db.prepare(`SELECT * FROM registration_types ${all ? '' : 'WHERE active=1'} ORDER BY category, name`).all());
});
const regVals = (b) => { need(b, 'name', 'category'); return [str(b.name), str(b.category), nul(str(b.description)), nul(str(b.required_documents)), nul(str(b.timeline)), nul(str(b.fee_note)), b.active === false ? 0 : 1]; };
mastersRouter.post('/registration-types', adminOnly, (req, res) => {
  const r = db.prepare('INSERT INTO registration_types (name,category,description,required_documents,timeline,fee_note,active) VALUES (?,?,?,?,?,?,?)').run(...regVals(req.body));
  audit(req.user, 'create_registration_type', 'registration_type', r.lastInsertRowid, req.body.name);
  res.status(201).json(db.prepare('SELECT * FROM registration_types WHERE id=?').get(r.lastInsertRowid));
});
mastersRouter.put('/registration-types/:id', adminOnly, (req, res) => {
  const id = Number(req.params.id);
  const r = db.prepare('UPDATE registration_types SET name=?,category=?,description=?,required_documents=?,timeline=?,fee_note=?,active=? WHERE id=?').run(...regVals(req.body), id);
  if (!r.changes) throw httpError(404, 'Registration type not found');
  audit(req.user, 'update_registration_type', 'registration_type', id, req.body.name);
  res.json(db.prepare('SELECT * FROM registration_types WHERE id=?').get(id));
});
mastersRouter.delete('/registration-types/:id', adminOnly, (req, res) => {
  const id = Number(req.params.id);
  if (db.prepare('SELECT 1 FROM registration_requests WHERE type_id=?').get(id)) { db.prepare('UPDATE registration_types SET active=0 WHERE id=?').run(id); return res.json({ deactivated: true }); }
  db.prepare('DELETE FROM registration_types WHERE id=?').run(id);
  audit(req.user, 'delete_registration_type', 'registration_type', id);
  res.json({ deleted: true });
});
