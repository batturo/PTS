import { db, tx } from './db.js';
import { CLOSED, today } from './util.js';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n) => String(n).padStart(2, '0');
const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const mk = (y, m, d) => `${y}-${pad(m)}-${pad(Math.min(d, lastDay(y, m)))}`;
const addMonths = (y, m, k) => { const t = y * 12 + (m - 1) + k; return [Math.floor(t / 12), (t % 12) + 1]; };

/** Indian financial year ("2026-27") that a date falls in. */
export function fyOf(date = today()) {
  const [y, m] = date.split('-').map(Number);
  const s = m >= 4 ? y : y - 1;
  return `${s}-${pad((s + 1) % 100)}`;
}
export const currentFY = () => fyOf();
export const fyStart = (fy) => parseInt(fy.slice(0, 4), 10);
export const validFY = (fy) => /^\d{4}-\d{2}$/.test(fy || '') && (fyStart(fy) + 1) % 100 === parseInt(fy.slice(5), 10);

/** All (period label, due date) pairs a compliance template produces in a financial year, ignoring overrides. */
export function periodsFor(t, fy) {
  const sy = fyStart(fy);
  const out = [];
  if (t.frequency === 'monthly') {
    for (let i = 0; i < 12; i++) {
      const m = ((3 + i) % 12) + 1, y = m >= 4 ? sy : sy + 1;
      const [dy, dm] = addMonths(y, m, t.due_offset_months ?? 1);
      out.push({ label: `${MON[m - 1]} ${y}`, due: mk(dy, dm, t.due_day || 1) });
    }
  } else if (t.frequency === 'quarterly') {
    const q = [['Apr–Jun', 6, sy], ['Jul–Sep', 9, sy], ['Oct–Dec', 12, sy], ['Jan–Mar', 3, sy + 1]];
    q.forEach(([name, endM, endY], i) => {
      const [dy, dm] = addMonths(endY, endM, t.due_offset_months ?? 1);
      out.push({ label: `Q${i + 1} ${name}`, due: mk(dy, dm, t.due_day || 1) });
    });
  } else {
    const sched = typeof t.schedule === 'string' ? JSON.parse(t.schedule || '[]') : t.schedule || [];
    sched.forEach((e, i) => out.push({ label: e.label || (sched.length === 1 ? `FY ${fy}` : `Part ${i + 1}`), due: mk(sy + (e.year_offset ?? 1), e.month, e.day) }));
  }
  return out;
}

export function entitiesOf(templateId) {
  return db.prepare('SELECT entity_type FROM template_entities WHERE template_id=?').all(templateId).map((r) => r.entity_type);
}
const CONDITION_FIELD = { gst: 'gst_registered', employees: 'has_employees', tds: 'tds_applicable' };
const applies = (t, client, ents) => ents.has(client.entity_type) && (!t.condition || client[CONDITION_FIELD[t.condition]]);

function overrideMap(templateId, fy) {
  const m = new Map();
  for (const o of db.prepare('SELECT period_label, due_date FROM due_overrides WHERE template_id=? AND fy=?').all(templateId, fy)) m.set(o.period_label, o.due_date);
  return m;
}

/**
 * Create the filings every matching client must make in a financial year. Safe to run repeatedly:
 * existing filings (and their status) are never touched. Optional filters: clientId, templateId.
 */
export function generateFilings({ fy = currentFY(), clientId, templateId } = {}) {
  const clients = db.prepare(`SELECT * FROM clients WHERE active=1 ${clientId ? 'AND id=?' : ''}`).all(...(clientId ? [clientId] : []));
  const templates = db.prepare(`SELECT * FROM templates WHERE active=1 ${templateId ? 'AND id=?' : ''}`).all(...(templateId ? [templateId] : []));
  const ins = db.prepare('INSERT OR IGNORE INTO filings (client_id,template_id,fy,period_label,due_date) VALUES (?,?,?,?,?)');
  let created = 0;
  tx(() => {
    for (const t of templates) {
      const ents = new Set(entitiesOf(t.id));
      const periods = periodsFor(t, fy), ov = overrideMap(t.id, fy);
      for (const c of clients) {
        if (!applies(t, c, ents)) continue;
        for (const p of periods) created += Number(ins.run(c.id, t.id, fy, p.label, ov.get(p.label) || p.due).changes);
      }
    }
  });
  return created;
}

/** After a template's due-date rule changes: move every not-yet-filed filing to the new rule (respecting overrides). */
export function recomputeDueDates(templateId) {
  const t = db.prepare('SELECT * FROM templates WHERE id=?').get(templateId);
  if (!t) return 0;
  let n = 0;
  const upd = db.prepare(`UPDATE filings SET due_date=?, updated_at=datetime('now') WHERE template_id=? AND fy=? AND period_label=? AND status NOT IN ('filed','not_applicable') AND due_date<>?`);
  tx(() => {
    for (const { fy } of db.prepare('SELECT DISTINCT fy FROM filings WHERE template_id=?').all(templateId)) {
      const ov = overrideMap(templateId, fy);
      for (const p of periodsFor(t, fy)) { const due = ov.get(p.label) || p.due; n += Number(upd.run(due, templateId, fy, p.label, due).changes); }
    }
  });
  return n;
}

export const isOverdue = (f) => f.due_date < today() && !CLOSED.includes(f.status);
export function daysLeft(due) { return Math.round((Date.parse(due) - Date.parse(today())) / 86400000); }
