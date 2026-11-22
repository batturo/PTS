import { Router } from 'express';
import { db, tx, num } from '../db.js';
import { allow, isFamily, myStudent } from '../auth.js';
import { bad, notFound, pick, insert, update, today, round2, daysBetween } from '../util.js';

export const feesRouter = Router();
const ACC = 'accountant';

// ---------- Fee structure (per class, per fee head) ----------
feesRouter.get('/structures', allow(ACC, 'teacher'), (req, res) => {
  res.json(db.prepare(`SELECT * FROM fee_structures ${req.query.class ? 'WHERE class=?' : ''} ORDER BY CAST(class AS INTEGER), class, fee_head`)
    .all(...(req.query.class ? [req.query.class] : [])));
});
feesRouter.post('/structures', allow(ACC), (req, res) => {
  const d = pick(req.body, ['class', 'fee_head', 'amount', 'frequency']);
  if (!d.class || !d.fee_head || !(Number(d.amount) >= 0)) throw bad('Class, fee head and amount are required');
  res.json({ id: insert(db, 'fee_structures', d) });
});
feesRouter.put('/structures/:id', allow(ACC), (req, res) => {
  update(db, 'fee_structures', req.params.id, pick(req.body, ['class', 'fee_head', 'amount', 'frequency']));
  res.json({ ok: true });
});
feesRouter.delete('/structures/:id', allow(ACC), (req, res) => {
  db.prepare('DELETE FROM fee_structures WHERE id=?').run(req.params.id); res.json({ ok: true });
});

/**
 * Which fee heads are billed in a given month (Indian academic year starts in April).
 *  Monthly: every month · Quarterly: Apr/Jul/Oct/Jan · Half-Yearly: Apr/Oct · Annual & One-Time: April only
 */
function appliesInMonth(freq, month) {
  const m = Number(month.slice(5, 7));
  return { Monthly: true, Quarterly: [4, 7, 10, 1].includes(m), 'Half-Yearly': [4, 10].includes(m), Annual: m === 4, 'One-Time': false }[freq] ?? false;
}

/** Late fee: per-day fine after due date (capped), counted until the invoice was cleared or today.
 *  `paidInfo` ({p, last}) can be passed in when payments were loaded in bulk. */
export function computeInvoice(inv, paidInfo) {
  const paid = paidInfo || db.prepare('SELECT COALESCE(SUM(amount),0) AS p, MAX(paid_on) AS last FROM fee_payments WHERE invoice_id=?').get(inv.id);
  const cleared = paid.p >= inv.total;
  const until = cleared ? paid.last : today();
  const late = Math.max(0, daysBetween(inv.due_date, until));
  const fine = round2(Math.max(0, Math.min(num('fee_fine_cap'), late * num('fee_fine_per_day')) - inv.waived_fine));
  const payable = round2(inv.total + fine);
  const balance = round2(Math.max(0, payable - paid.p));
  return { ...inv, items: typeof inv.items === 'string' ? JSON.parse(inv.items) : inv.items, late_fee: fine, payable, paid: round2(paid.p), balance,
    last_paid_on: paid.last || null,
    status: balance <= 0 ? 'Paid' : paid.p > 0 ? 'Partially Paid' : until > inv.due_date ? 'Overdue' : 'Due' };
}

/** Concession applies to all heads except transport. */
function totals(student, items) {
  const gross = round2(items.reduce((a, i) => a + Number(i.amount), 0));
  const eligible = items.filter(i => !/transport/i.test(i.head)).reduce((a, i) => a + Number(i.amount), 0);
  const concession = round2(eligible * (Number(student.concession_pct) || 0) / 100);
  return { gross, concession, total: round2(gross - concession) };
}

function buildInvoice(student, period, due_date, items) {
  const t = totals(student, items);
  const id = insert(db, 'fee_invoices', { student_id: student.id, period, items: JSON.stringify(items), ...t, due_date });
  db.prepare('UPDATE fee_invoices SET invoice_no=? WHERE id=?').run(`INV-${period.replace('-', '')}-${String(id).padStart(5, '0')}`, id);
  return id;
}

/** Fee heads billed to this student for a month, from the class fee structure. */
function feeItemsFor(student, period, { includeOneTime = false, structures } = {}) {
  const rows = structures ? (structures[student.class] || []) : db.prepare('SELECT * FROM fee_structures WHERE class=?').all(student.class);
  return rows.filter(f => appliesInMonth(f.frequency, period) || (f.frequency === 'One-Time' && includeOneTime))
    .filter(f => !/transport/i.test(f.fee_head) || student.route_no)
    .map(f => ({ head: f.fee_head, amount: round2(f.amount), frequency: f.frequency }));
}
const loadStructures = () => {
  const m = {};
  for (const f of db.prepare('SELECT * FROM fee_structures').all()) (m[f.class] ||= []).push(f);
  return m;
};

// ---------- Academic year helpers (April – March) ----------
export const ayStart = (d = today()) => { const y = Number(d.slice(0, 4)), m = Number(d.slice(5, 7)); return m >= 4 ? y : y - 1; };
export const ayMonths = (y) => [...Array(12)].map((_, i) => { const m = ((i + 3) % 12) + 1; return `${m >= 4 ? y : y + 1}-${String(m).padStart(2, '0')}`; });
const ayLabel = (y) => `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
const dueDateFor = (period) => `${period}-${String(Math.min(28, Math.max(1, num('fee_due_day') || 10))).padStart(2, '0')}`;
const parseAy = (v) => { const y = Number(v); return y > 2000 && y < 2200 ? y : ayStart(); };

/** All invoices (computed) for the given students, with payments loaded in one query. */
function invoicesFor(studentIds) {
  if (!studentIds.length) return [];
  const ph = studentIds.map(() => '?').join(',');
  const paid = Object.fromEntries(db.prepare(`SELECT invoice_id, COALESCE(SUM(amount),0) AS p, MAX(paid_on) AS last FROM fee_payments
    WHERE student_id IN (${ph}) GROUP BY invoice_id`).all(...studentIds).map(r => [r.invoice_id, r]));
  return db.prepare(`SELECT * FROM fee_invoices WHERE student_id IN (${ph}) ORDER BY due_date, period`).all(...studentIds)
    .map(i => computeInvoice(i, paid[i.id] || { p: 0, last: null }));
}

/**
 * A student's fee position for an academic year:
 *  months – April→March, each billed (with its invoice) or not yet billed (with the amount the fee structure would bill)
 *  pastDues – unpaid invoices from earlier years · otherDues – unpaid extra invoices (trips, etc.) in this year
 */
function ledger(student, ay, invoices, structures) {
  const months = ayMonths(ay);
  const t = today().slice(0, 7);
  const monthRows = months.map(period => {
    const inv = invoices.find(i => i.period === period);
    if (inv) return { period, billed: true, invoice_id: inv.id, invoice_no: inv.invoice_no, amount: inv.payable, paid: inv.paid, balance: inv.balance,
      late_fee: inv.late_fee, status: inv.status, due_date: inv.due_date, items: inv.items };
    const items = student.active ? feeItemsFor(student, period, { structures }) : [];
    const exp = totals(student, items);
    return { period, billed: false, amount: exp.total, paid: 0, balance: exp.total, status: exp.total > 0 ? (period <= t ? 'Not billed' : 'Upcoming') : 'No fee',
      due_date: dueDateFor(period), items };
  });
  const inYear = (i) => months.includes(i.period.slice(0, 7));
  const pastDues = invoices.filter(i => i.balance > 0 && i.period.slice(0, 7) < months[0]);
  const otherDues = invoices.filter(i => i.balance > 0 && inYear(i) && !months.includes(i.period));
  const yearInvoices = invoices.filter(inYear);
  const sum = (arr, k) => round2(arr.reduce((a, r) => a + r[k], 0));
  const unbilled = monthRows.filter(m => !m.billed);
  return {
    months: monthRows, pastDues, otherDues,
    totals: {
      expected: round2(sum(yearInvoices, 'payable') + sum(unbilled, 'amount')),
      billed: sum(yearInvoices, 'payable'), collected: sum(yearInvoices, 'paid'), due: sum(yearInvoices, 'balance'),
      notBilled: sum(unbilled, 'amount'), notBilledTillDate: sum(unbilled.filter(m => m.period <= t), 'amount'),
      pastDues: sum(pastDues, 'balance'),
    },
    lastPaidOn: invoices.reduce((a, i) => (i.last_paid_on && (!a || i.last_paid_on > a) ? i.last_paid_on : a), null),
  };
}

/** Generate invoices for a whole class (or school) for a month from the fee structure. */
feesRouter.post('/generate', allow(ACC), (req, res) => {
  const { period, due_date, class: cls, section } = req.body;
  if (!/^\d{4}-\d{2}$/.test(period || '') || !due_date) throw bad('Billing month (YYYY-MM) and due date are required');
  const where = ['active=1'], args = [];
  if (cls) { where.push('class=?'); args.push(cls); }
  if (section) { where.push('section=?'); args.push(section); }
  const students = db.prepare(`SELECT * FROM students WHERE ${where.join(' AND ')}`).all(...args);
  let created = 0, skipped = 0, noStructure = 0;
  tx(() => {
    for (const s of students) {
      if (db.prepare('SELECT 1 FROM fee_invoices WHERE student_id=? AND period=?').get(s.id, period)) { skipped++; continue; }
      const items = feeItemsFor(s, period, { includeOneTime: !!req.body.include_one_time });
      if (!items.length) { noStructure++; continue; }
      buildInvoice(s, period, due_date, items); created++;
    }
  });
  res.json({ created, skipped, noStructure });
});

/** One-off invoice for a single student with custom items. */
feesRouter.post('/invoices', allow(ACC), (req, res) => {
  const { student_id, period, due_date, items } = req.body;
  const s = db.prepare('SELECT * FROM students WHERE id=?').get(student_id);
  if (!s) throw notFound('Student');
  if (!period || !due_date || !Array.isArray(items) || !items.length) throw bad('Period, due date and at least one item are required');
  if (db.prepare('SELECT 1 FROM fee_invoices WHERE student_id=? AND period=?').get(s.id, period)) throw bad('An invoice for this student and period already exists. Use a different period label (e.g. 2026-11-EXTRA).');
  res.json({ id: buildInvoice(s, period, due_date, items.map(i => ({ head: i.head, amount: round2(i.amount) }))) });
});

const INV_SQL = `SELECT i.*, s.name AS student_name, s.admission_no, s.class, s.section, s.father_name, s.mobile
  FROM fee_invoices i JOIN students s ON s.id=i.student_id`;

feesRouter.get('/invoices', allow(ACC), (req, res) => {
  const { class: cls, section, period, student_id, status, q } = req.query;
  const where = ['1=1'], args = [];
  if (cls) { where.push('s.class=?'); args.push(cls); }
  if (section) { where.push('s.section=?'); args.push(section); }
  if (period) { where.push('i.period=?'); args.push(period); }
  if (student_id) { where.push('i.student_id=?'); args.push(student_id); }
  if (q) { where.push('(s.name LIKE ? OR s.admission_no LIKE ? OR i.invoice_no LIKE ?)'); args.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  let rows = db.prepare(`${INV_SQL} WHERE ${where.join(' AND ')} ORDER BY i.period DESC, s.class, s.name LIMIT 1000`).all(...args).map(computeInvoice);
  if (status) rows = rows.filter(r => status === 'Unpaid' ? r.balance > 0 : r.status === status);
  res.json(rows);
});
feesRouter.get('/invoices/:id', (req, res) => {
  const inv = db.prepare(`${INV_SQL} WHERE i.id=?`).get(req.params.id);
  if (!inv) throw notFound('Invoice');
  if (isFamily(req.user) ? inv.student_id !== myStudent(req).id : !['admin', ACC].includes(req.user.role)) throw bad('Not allowed');
  res.json({ ...computeInvoice(inv), payments: db.prepare('SELECT p.*, r.receipt_no FROM fee_payments p LEFT JOIN fee_receipts r ON r.id=p.receipt_id WHERE p.invoice_id=? ORDER BY p.id').all(inv.id) });
});
feesRouter.put('/invoices/:id/waive-fine', allow(ACC), (req, res) => {
  db.prepare('UPDATE fee_invoices SET waived_fine=? WHERE id=?').run(round2(req.body.amount), req.params.id); res.json({ ok: true });
});
feesRouter.delete('/invoices/:id', allow(ACC), (req, res) => {
  if (db.prepare('SELECT 1 FROM fee_payments WHERE invoice_id=?').get(req.params.id)) throw bad('Cannot delete an invoice that has payments');
  db.prepare('DELETE FROM fee_invoices WHERE id=?').run(req.params.id); res.json({ ok: true });
});

// ---------- Fee entry: search a student, see the year, collect ----------
const MODES = ['Cash', 'UPI', 'Cheque', 'Bank Transfer', 'Card', 'Online'];

feesRouter.get('/search', allow(ACC), (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json([]);
  const like = `%${q}%`;
  const students = db.prepare(`SELECT id, admission_no, name, father_name, mobile, class, section, roll_no, active FROM students
    WHERE name LIKE ? OR admission_no LIKE ? OR father_name LIKE ? OR mobile LIKE ?
    ORDER BY active DESC, name LIKE ? DESC, name LIMIT 20`).all(like, like, like, like, `${q}%`);
  const inv = invoicesFor(students.map(s => s.id));
  res.json(students.map(s => ({ ...s, outstanding: round2(inv.filter(i => i.student_id === s.id).reduce((a, i) => a + i.balance, 0)) })));
});

feesRouter.get('/student/:id/ledger', allow(ACC), (req, res) => {
  const s = db.prepare('SELECT * FROM students WHERE id=?').get(req.params.id);
  if (!s) throw notFound('Student');
  const ay = parseAy(req.query.ay);
  const inv = invoicesFor([s.id]);
  res.json({ student: s, ay, ay_label: ayLabel(ay), ...ledger(s, ay, inv, loadStructures()),
    receipts: db.prepare('SELECT * FROM fee_receipts WHERE student_id=? ORDER BY paid_on DESC, id DESC LIMIT 20').all(s.id) });
});

function nextReceiptNo(date) {
  const y = date.slice(0, 4);
  const last = db.prepare("SELECT receipt_no FROM fee_receipts WHERE receipt_no LIKE ? ORDER BY receipt_no DESC LIMIT 1").get(`RCPT-${y}-%`);
  const n = last ? Number(last.receipt_no.slice(10)) + 1 : 1;
  return `RCPT-${y}-${String(n).padStart(6, '0')}`;
}

/**
 * Collect fees in one receipt. Pays the chosen invoices and/or months; months not billed yet are billed from the fee
 * structure as the money reaches them. The amount is applied oldest first, so a part payment clears the oldest dues.
 */
export function collect({ student_id, invoice_ids = [], months = [], amount, mode, reference, paid_on, note }, userId) {
  const s = db.prepare('SELECT * FROM students WHERE id=?').get(student_id);
  if (!s) throw notFound('Student');
  const amt = round2(amount);
  if (!(amt > 0)) throw bad('Enter a valid amount');
  if (!MODES.includes(mode)) throw bad('Choose a payment mode');
  const date = paid_on || today();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today()) throw bad('Payment date cannot be in the future');
  if (!invoice_ids.length && !months.length) throw bad('Select at least one month or due to pay');
  const invs = invoicesFor([s.id]);
  const targets = [];
  for (const id of new Set(invoice_ids.map(Number))) {
    const i = invs.find(x => x.id === id);
    if (!i) throw bad('One of the selected dues does not belong to this student');
    if (i.balance > 0) targets.push({ inv: i, period: i.period, due: i.due_date, balance: i.balance });
  }
  for (const period of new Set(months)) {
    if (!/^\d{4}-\d{2}$/.test(period)) throw bad(`Invalid month ${period}`);
    const existing = invs.find(x => x.period === period);
    if (existing) { if (existing.balance > 0 && !targets.some(t => t.inv?.id === existing.id)) targets.push({ inv: existing, period, due: existing.due_date, balance: existing.balance }); continue; }
    const items = feeItemsFor(s, period);
    const t = totals(s, items);
    if (!items.length || t.total <= 0) throw bad(`No fee is set for Class ${s.class} in ${period}. Check the fee structure.`);
    // A month billed only now (at the counter) is due today at the earliest, so no late fee is charged for it
    const due = dueDateFor(period) < date ? date : dueDateFor(period);
    targets.push({ period, due, balance: t.total, items });
  }
  // oldest month first (then by due date), so a part payment clears the oldest dues
  const key = (t) => `${t.period.slice(0, 7)}|${t.due}|${t.period}`;
  targets.sort((a, b) => (key(a) < key(b) ? -1 : 1));
  const total = round2(targets.reduce((a, t) => a + t.balance, 0));
  if (!targets.length) throw bad('The selected months are already paid');
  if (amt > total + 0.001) throw bad(`Amount is more than the selected dues (₹${total})`);
  return tx(() => {
    const receipt_no = nextReceiptNo(date);
    const rid = insert(db, 'fee_receipts', { receipt_no, student_id: s.id, amount: amt, mode, reference: reference || null, note: note || null, paid_on: date, received_by: userId });
    let left = amt;
    for (const t of targets) {
      if (left <= 0.001) break;
      const invoiceId = t.inv ? t.inv.id : buildInvoice(s, t.period, t.due, t.items);
      const pay = round2(Math.min(left, t.balance));
      insert(db, 'fee_payments', { invoice_id: invoiceId, student_id: s.id, amount: pay, mode, reference: reference || null, paid_on: date, received_by: userId, receipt_id: rid });
      left = round2(left - pay);
    }
    return { id: rid, receipt_no };
  });
}
feesRouter.post('/collect', allow(ACC), (req, res) => res.json(collect(req.body, req.user.id)));
// Older single-invoice collection, kept for the Invoices screen
feesRouter.post('/payments', allow(ACC), (req, res) => res.json(collect({ ...req.body, invoice_ids: [req.body.invoice_id] }, req.user.id)));

// ---------- Receipts ----------
const RECEIPT_SQL = `SELECT r.*, s.name AS student_name, s.admission_no, s.class, s.section, s.father_name, u.name AS received_by_name
  FROM fee_receipts r JOIN students s ON s.id=r.student_id LEFT JOIN users u ON u.id=r.received_by`;
function receipt(id, req) {
  const r = db.prepare(`${RECEIPT_SQL} WHERE r.id=?`).get(id);
  if (!r) throw notFound('Receipt');
  if (isFamily(req.user) ? r.student_id !== myStudent(req).id : !['admin', ACC].includes(req.user.role)) throw bad('Not allowed');
  const lines = db.prepare(`SELECT p.amount, i.invoice_no, i.period, i.items FROM fee_payments p JOIN fee_invoices i ON i.id=p.invoice_id
    WHERE p.receipt_id=? ORDER BY substr(i.period,1,7), i.due_date, i.period`).all(r.id).map(l => ({ ...l, items: JSON.parse(l.items) }));
  return { ...r, lines };
}
feesRouter.get('/receipts/:id', (req, res) => res.json(receipt(req.params.id, req)));
feesRouter.get('/receipts', allow(ACC), (req, res) => {
  const { from = '0000', to = '9999' } = req.query;
  res.json(db.prepare(`${RECEIPT_SQL} WHERE r.paid_on BETWEEN ? AND ? ORDER BY r.paid_on DESC, r.id DESC LIMIT 2000`).all(from, to).map(r => ({
    ...r, periods: db.prepare('SELECT i.period FROM fee_payments p JOIN fee_invoices i ON i.id=p.invoice_id WHERE p.receipt_id=? ORDER BY i.period').all(r.id).map(x => x.period) })));
});
/** Cancelling a receipt removes its payments; the months it paid become due again. */
feesRouter.delete('/receipts/:id', allow('admin'), (req, res) => {
  tx(() => { db.prepare('DELETE FROM fee_payments WHERE receipt_id=?').run(req.params.id); db.prepare('DELETE FROM fee_receipts WHERE id=?').run(req.params.id); });
  res.json({ ok: true });
});
// Old links: a payment's receipt
feesRouter.get('/payments/:id/receipt', (req, res) => {
  const p = db.prepare('SELECT receipt_id FROM fee_payments WHERE id=?').get(req.params.id);
  if (!p) throw notFound('Receipt');
  res.json(receipt(p.receipt_id, req));
});

// ---------- Current fees status (class-wise, whole year) ----------
function studentsFor({ class: cls, section, includeInactive } = {}) {
  const where = [includeInactive ? '1=1' : 'active=1'], args = [];
  if (cls) { where.push('class=?'); args.push(cls); }
  if (section) { where.push('section=?'); args.push(section); }
  return db.prepare(`SELECT * FROM students WHERE ${where.join(' AND ')}`).all(...args);
}
feesRouter.get('/status', allow(ACC), (req, res) => {
  const ay = parseAy(req.query.ay);
  const students = studentsFor({ includeInactive: true });
  const inv = invoicesFor(students.map(s => s.id));
  const structures = loadStructures();
  const order = Object.fromEntries(db.prepare('SELECT name, sort_order FROM classes').all().map(c => [c.name, c.sort_order]));
  const keys = ['expected', 'billed', 'collected', 'due', 'notBilled', 'notBilledTillDate', 'pastDues'];
  const blank = () => Object.fromEntries([...keys, 'students', 'defaulters'].map(k => [k, 0]));
  const classes = {};
  for (const s of students) {
    const l = ledger(s, ay, inv.filter(i => i.student_id === s.id), structures);
    if (!s.active && !l.totals.billed && !l.totals.pastDues) continue; // left the school with nothing to settle
    const c = (classes[s.class] ||= { class: s.class, ...blank(), sections: {} });
    const sec = (c.sections[s.section] ||= { section: s.section, ...blank() });
    for (const row of [c, sec]) {
      for (const k of keys) row[k] += l.totals[k];
      row.students += 1;
      if (l.totals.due + l.totals.pastDues + l.totals.notBilledTillDate > 0.001) row.defaulters += 1;
    }
  }
  const fix = (r) => { for (const k of keys) r[k] = round2(r[k]); return r; };
  const rows = Object.values(classes).map(c => ({ ...fix(c), sections: Object.values(c.sections).map(fix).sort((a, b) => a.section.localeCompare(b.section)) }))
    .sort((a, b) => (order[a.class] ?? Number(a.class) ?? 999) - (order[b.class] ?? Number(b.class) ?? 999) || String(a.class).localeCompare(String(b.class)));
  const total = fix(rows.reduce((t, r) => { for (const k of [...keys, 'students', 'defaulters']) t[k] += r[k]; return t; }, blank()));
  const yearMonths = ayMonths(ay);
  res.json({ ay, ay_label: ayLabel(ay), classes: rows, total,
    todayCollection: db.prepare('SELECT COALESCE(SUM(amount),0) a FROM fee_receipts WHERE paid_on=?').get(today()).a,
    byMode: db.prepare('SELECT mode, ROUND(SUM(amount),2) AS amount, COUNT(*) AS count FROM fee_receipts WHERE substr(paid_on,1,7) BETWEEN ? AND ? GROUP BY mode').all(yearMonths[0], yearMonths[11]),
    years: [...new Set([ay, ayStart(), ...db.prepare('SELECT DISTINCT substr(period,1,7) p FROM fee_invoices').all().map(r => ayStart(`${r.p}-01`))])].sort((a, b) => b - a) });
});

// ---------- Defaulters (students who have not paid) ----------
/**
 * Filters: class, section, ay and one of
 *  month=YYYY-MM – has not (fully) paid that month · min_months=N – N or more unpaid months · neither – anything due
 * upto=YYYY-MM – only months up to here count (default: this month) · unbilled=0 – ignore months not billed yet
 */
function defaulters(q) {
  const ay = parseAy(q.ay);
  const months = ayMonths(ay);
  const upto = /^\d{4}-\d{2}$/.test(q.upto || '') ? q.upto : today().slice(0, 7);
  const countUnbilled = q.unbilled !== '0';
  const students = studentsFor(q);
  const inv = invoicesFor(students.map(s => s.id));
  const structures = loadStructures();
  const out = [];
  for (const s of students) {
    const l = ledger(s, ay, inv.filter(i => i.student_id === s.id), structures);
    const unpaid = l.months.filter(m => m.period <= upto && m.balance > 0.001 && (m.billed || (countUnbilled && m.status !== 'No fee')));
    const other = [...l.pastDues, ...l.otherDues];
    const monthDue = round2(unpaid.reduce((a, m) => a + m.balance, 0));
    const otherDue = round2(other.reduce((a, i) => a + i.balance, 0));
    let match;
    if (q.month) match = unpaid.some(m => m.period === q.month) || (q.month > upto && l.months.some(m => m.period === q.month && m.balance > 0.001 && (m.billed || countUnbilled)));
    else if (Number(q.min_months) > 0) match = unpaid.length >= Number(q.min_months);
    else match = monthDue + otherDue > 0.001;
    if (!match) continue;
    out.push({ id: s.id, admission_no: s.admission_no, name: s.name, father_name: s.father_name, mobile: s.mobile, class: s.class, section: s.section,
      roll_no: s.roll_no, unpaid_months: unpaid.map(m => ({ period: m.period, balance: m.balance, billed: m.billed })),
      month_due: monthDue, past_due: round2(l.totals.pastDues), other_due: round2(otherDue - l.totals.pastDues), total_due: round2(monthDue + otherDue), last_paid_on: l.lastPaidOn });
  }
  const order = Object.fromEntries(db.prepare('SELECT name, sort_order FROM classes').all().map(c => [c.name, c.sort_order]));
  out.sort((a, b) => (order[a.class] ?? 999) - (order[b.class] ?? 999) || a.section.localeCompare(b.section) || (Number(a.roll_no) || 0) - (Number(b.roll_no) || 0) || a.name.localeCompare(b.name));
  return { ay, ay_label: ayLabel(ay), months, upto, rows: out, total_due: round2(out.reduce((a, r) => a + r.total_due, 0)) };
}
feesRouter.get('/defaulters', allow(ACC), (req, res) => res.json(defaulters(req.query)));

/** Send a fee reminder notice to the students/parents selected from the defaulters list. */
feesRouter.post('/reminders', allow(ACC), (req, res) => {
  const ids = (req.body.student_ids || []).map(Number);
  if (!ids.length) throw bad('Select at least one student');
  const list = defaulters({ ...req.body.filters, month: undefined, min_months: undefined }).rows.filter(r => ids.includes(r.id));
  const label = (p) => new Date(`${p}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  tx(() => list.forEach(r => {
    const parts = [];
    if (r.unpaid_months.length) parts.push(`fees for ${r.unpaid_months.map(m => label(m.period)).join(', ')}`);
    if (r.past_due > 0) parts.push(`previous dues of ₹${r.past_due}`);
    if (r.other_due > 0) parts.push(`other dues of ₹${r.other_due}`);
    insert(db, 'notices', { title: 'Fee reminder: payment pending', category: 'Fees', student_id: r.id, notice_date: today(), created_by: req.user.id,
      body: `Dear Parent, ${parts.join(' and ')} for ${r.name} (Class ${r.class}-${r.section}) ${parts.length > 1 ? 'are' : 'is'} pending. Total due: ₹${r.total_due}.`
        + ` Please pay at the school accounts office at the earliest.${req.body.note ? `\n\n${req.body.note}` : ''}` });
  }));
  res.json({ sent: list.length });
});

// ---------- Student / parent view ----------
feesRouter.get('/my', allow('student', 'parent'), (req, res) => {
  const s = myStudent(req);
  const invoices = db.prepare(`${INV_SQL} WHERE i.student_id=? ORDER BY i.period DESC`).all(s.id).map(computeInvoice);
  const receipts = db.prepare('SELECT * FROM fee_receipts WHERE student_id=? ORDER BY paid_on DESC, id DESC').all(s.id);
  res.json({ invoices, receipts, totals: {
    payable: round2(invoices.reduce((a, i) => a + i.payable, 0)), paid: round2(invoices.reduce((a, i) => a + i.paid, 0)),
    balance: round2(invoices.reduce((a, i) => a + i.balance, 0)) } });
});
