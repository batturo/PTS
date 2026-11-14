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

/** Late fee: per-day fine after due date (capped), counted until the invoice was cleared or today. */
export function computeInvoice(inv) {
  const paid = db.prepare('SELECT COALESCE(SUM(amount),0) AS p, MAX(paid_on) AS last FROM fee_payments WHERE invoice_id=?').get(inv.id);
  const cleared = paid.p >= inv.total;
  const until = cleared ? paid.last : today();
  const late = Math.max(0, daysBetween(inv.due_date, until));
  const fine = round2(Math.max(0, Math.min(num('fee_fine_cap'), late * num('fee_fine_per_day')) - inv.waived_fine));
  const payable = round2(inv.total + fine);
  const balance = round2(Math.max(0, payable - paid.p));
  return { ...inv, items: JSON.parse(inv.items), late_fee: fine, payable, paid: round2(paid.p), balance,
    status: balance <= 0 ? 'Paid' : paid.p > 0 ? 'Partially Paid' : until > inv.due_date ? 'Overdue' : 'Due' };
}

function buildInvoice(student, period, due_date, items) {
  const gross = round2(items.reduce((a, i) => a + Number(i.amount), 0));
  // Concession applies to all heads except transport
  const eligible = items.filter(i => !/transport/i.test(i.head)).reduce((a, i) => a + Number(i.amount), 0);
  const concession = round2(eligible * (Number(student.concession_pct) || 0) / 100);
  const id = insert(db, 'fee_invoices', { student_id: student.id, period, items: JSON.stringify(items), gross, concession, total: round2(gross - concession), due_date });
  db.prepare('UPDATE fee_invoices SET invoice_no=? WHERE id=?').run(`INV-${period.replace('-', '')}-${String(id).padStart(5, '0')}`, id);
  return id;
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
      const items = db.prepare('SELECT * FROM fee_structures WHERE class=?').all(s.class)
        .filter(f => appliesInMonth(f.frequency, period) || (f.frequency === 'One-Time' && req.body.include_one_time))
        .filter(f => !/transport/i.test(f.fee_head) || s.route_no)
        .map(f => ({ head: f.fee_head, amount: round2(f.amount), frequency: f.frequency }));
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
  res.json({ ...computeInvoice(inv), payments: db.prepare('SELECT * FROM fee_payments WHERE invoice_id=? ORDER BY id').all(inv.id) });
});
feesRouter.put('/invoices/:id/waive-fine', allow(ACC), (req, res) => {
  db.prepare('UPDATE fee_invoices SET waived_fine=? WHERE id=?').run(round2(req.body.amount), req.params.id); res.json({ ok: true });
});
feesRouter.delete('/invoices/:id', allow(ACC), (req, res) => {
  if (db.prepare('SELECT 1 FROM fee_payments WHERE invoice_id=?').get(req.params.id)) throw bad('Cannot delete an invoice that has payments');
  db.prepare('DELETE FROM fee_invoices WHERE id=?').run(req.params.id); res.json({ ok: true });
});

// ---------- Payments & receipts ----------
feesRouter.post('/payments', allow(ACC), (req, res) => {
  const { invoice_id, amount, mode, reference, paid_on } = req.body;
  const raw = db.prepare('SELECT * FROM fee_invoices WHERE id=?').get(invoice_id);
  if (!raw) throw notFound('Invoice');
  const inv = computeInvoice(raw);
  const amt = round2(amount);
  if (!(amt > 0)) throw bad('Enter a valid amount');
  if (amt > inv.balance + 0.001) throw bad(`Amount exceeds balance of ₹${inv.balance}`);
  if (!['Cash', 'UPI', 'Cheque', 'Bank Transfer', 'Card', 'Online'].includes(mode)) throw bad('Invalid payment mode');
  const id = insert(db, 'fee_payments', { invoice_id, student_id: raw.student_id, amount: amt, mode, reference: reference || null, paid_on: paid_on || today(), received_by: req.user.id });
  const receipt_no = `RCPT-${(paid_on || today()).slice(0, 4)}-${String(id).padStart(6, '0')}`;
  db.prepare('UPDATE fee_payments SET receipt_no=? WHERE id=?').run(receipt_no, id);
  res.json({ id, receipt_no });
});
feesRouter.get('/payments', allow(ACC), (req, res) => {
  const { from = '0000', to = '9999' } = req.query;
  res.json(db.prepare(`SELECT p.*, s.name AS student_name, s.admission_no, s.class, s.section, i.invoice_no, i.period
    FROM fee_payments p JOIN students s ON s.id=p.student_id JOIN fee_invoices i ON i.id=p.invoice_id
    WHERE p.paid_on BETWEEN ? AND ? ORDER BY p.id DESC LIMIT 1000`).all(from, to));
});
feesRouter.get('/payments/:id/receipt', (req, res) => {
  const p = db.prepare(`SELECT p.*, s.name AS student_name, s.admission_no, s.class, s.section, s.father_name, i.invoice_no, i.period, u.name AS received_by_name
    FROM fee_payments p JOIN students s ON s.id=p.student_id JOIN fee_invoices i ON i.id=p.invoice_id LEFT JOIN users u ON u.id=p.received_by WHERE p.id=?`).get(req.params.id);
  if (!p) throw notFound('Receipt');
  if (isFamily(req.user) ? p.student_id !== myStudent(req).id : !['admin', ACC].includes(req.user.role)) throw bad('Not allowed');
  res.json(p);
});
feesRouter.delete('/payments/:id', allow('admin'), (req, res) => {
  db.prepare('DELETE FROM fee_payments WHERE id=?').run(req.params.id); res.json({ ok: true });
});

feesRouter.get('/summary', allow(ACC), (req, res) => {
  const all = db.prepare(INV_SQL).all().map(computeInvoice);
  const sum = (arr, k) => round2(arr.reduce((a, r) => a + r[k], 0));
  const byClass = {};
  for (const r of all) {
    const c = (byClass[r.class] ||= { class: r.class, billed: 0, collected: 0, outstanding: 0 });
    c.billed += r.payable; c.collected += r.paid; c.outstanding += r.balance;
  }
  const t = today();
  res.json({
    billed: sum(all, 'payable'), collected: sum(all, 'paid'), outstanding: sum(all, 'balance'),
    overdueCount: all.filter(r => r.status === 'Overdue' || (r.balance > 0 && r.due_date < t)).length,
    todayCollection: db.prepare('SELECT COALESCE(SUM(amount),0) AS a FROM fee_payments WHERE paid_on=?').get(t).a,
    byClass: Object.values(byClass).map(c => ({ ...c, billed: round2(c.billed), collected: round2(c.collected), outstanding: round2(c.outstanding) })),
    byMode: db.prepare('SELECT mode, ROUND(SUM(amount),2) AS amount, COUNT(*) AS count FROM fee_payments GROUP BY mode').all(),
  });
});

// ---------- Student / parent view ----------
feesRouter.get('/my', allow('student', 'parent'), (req, res) => {
  const s = myStudent(req);
  const invoices = db.prepare(`${INV_SQL} WHERE i.student_id=? ORDER BY i.period DESC`).all(s.id).map(computeInvoice);
  const payments = db.prepare('SELECT p.*, i.invoice_no, i.period FROM fee_payments p JOIN fee_invoices i ON i.id=p.invoice_id WHERE p.student_id=? ORDER BY p.id DESC').all(s.id);
  res.json({ invoices, payments, totals: {
    payable: round2(invoices.reduce((a, i) => a + i.payable, 0)), paid: round2(invoices.reduce((a, i) => a + i.paid, 0)),
    balance: round2(invoices.reduce((a, i) => a + i.balance, 0)) } });
});
