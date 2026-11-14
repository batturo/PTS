import { Router } from 'express';
import { db, tx, num } from '../db.js';
import { allow } from '../auth.js';
import { bad, notFound, pick, insert, update, today, round2 } from '../util.js';

export const payrollRouter = Router();
const ACC = 'accountant';

const EMP_FIELDS = ['emp_code', 'name', 'father_name', 'mother_name', 'dob', 'gender', 'profession', 'department', 'address', 'phone', 'email',
  'pan', 'aadhaar', 'uan', 'bank_name', 'bank_account', 'ifsc', 'join_date', 'pay_type', 'basic', 'da', 'hra', 'other_allowance',
  'hourly_rate', 'std_hours_per_day', 'pf_enabled', 'esi_enabled', 'pt_enabled', 'tds_monthly', 'user_id'];

// ---------- Employees ----------
payrollRouter.get('/employees', allow(ACC), (req, res) => {
  const { status = 'Active', q } = req.query;
  const where = [], args = [];
  if (status !== 'All') { where.push('e.status=?'); args.push(status); }
  if (q) { where.push('(e.name LIKE ? OR e.emp_code LIKE ? OR e.profession LIKE ?)'); args.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  res.json(db.prepare(`SELECT e.*, u.username FROM employees e LEFT JOIN users u ON u.id=e.user_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY e.emp_code`).all(...args));
});
payrollRouter.get('/employees/:id', allow(ACC), (req, res) => {
  const e = db.prepare('SELECT * FROM employees WHERE id=?').get(req.params.id);
  if (!e) throw notFound('Employee');
  res.json(e);
});
payrollRouter.post('/employees', allow(ACC), (req, res) => {
  const d = pick(req.body, EMP_FIELDS);
  if (!d.name || !d.profession) throw bad('Name and profession are required');
  if (d.pay_type === 'Hourly' ? !(d.hourly_rate > 0) : !(d.basic > 0)) throw bad(d.pay_type === 'Hourly' ? 'Hourly rate is required' : 'Basic salary is required');
  if (!d.emp_code) {
    const n = db.prepare("SELECT COUNT(*) AS c FROM employees").get().c + 1;
    d.emp_code = `EMP${String(n).padStart(4, '0')}`;
    while (db.prepare('SELECT 1 FROM employees WHERE emp_code=?').get(d.emp_code)) d.emp_code += 'A';
  } else if (db.prepare('SELECT 1 FROM employees WHERE emp_code=?').get(d.emp_code)) throw bad('Employee code already exists');
  res.json({ id: insert(db, 'employees', d), emp_code: d.emp_code });
});
payrollRouter.put('/employees/:id', allow(ACC), (req, res) => {
  if (!update(db, 'employees', req.params.id, pick(req.body, EMP_FIELDS))) throw notFound('Employee');
  res.json({ ok: true });
});
/** Removing an employee keeps their payroll history (status → Removed). ?permanent=1 deletes if no payroll exists. */
payrollRouter.delete('/employees/:id', allow(ACC), (req, res) => {
  const e = db.prepare('SELECT * FROM employees WHERE id=?').get(req.params.id);
  if (!e) throw notFound('Employee');
  if (req.query.permanent === '1') {
    if (db.prepare('SELECT 1 FROM payroll WHERE employee_id=?').get(e.id)) throw bad('Employee has payroll history; it can only be marked as removed');
    db.prepare('DELETE FROM employees WHERE id=?').run(e.id);
  } else {
    db.prepare("UPDATE employees SET status='Removed', exit_date=?, exit_reason=? WHERE id=?").run(req.body?.exit_date || today(), req.body?.exit_reason || null, e.id);
    if (e.user_id) db.prepare('UPDATE users SET active=0 WHERE id=?').run(e.user_id);
  }
  res.json({ ok: true });
});
payrollRouter.post('/employees/:id/restore', allow(ACC), (req, res) => {
  db.prepare("UPDATE employees SET status='Active', exit_date=NULL, exit_reason=NULL WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

// ---------- Employee attendance & hours ----------
const hoursFrom = (inT, outT) => {
  if (!inT || !outT) return null;
  const [a, b] = [inT, outT].map(t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; });
  return b > a ? round2((b - a) / 60) : null;
};
payrollRouter.get('/attendance', allow(ACC), (req, res) => {
  const date = req.query.date || today();
  res.json(db.prepare(`SELECT e.id AS employee_id, e.emp_code, e.name, e.profession, e.pay_type, e.std_hours_per_day,
      a.status, a.check_in, a.check_out, a.hours_worked
    FROM employees e LEFT JOIN employee_attendance a ON a.employee_id=e.id AND a.date=?
    WHERE e.status='Active' AND (e.join_date IS NULL OR e.join_date<=?) ORDER BY e.emp_code`).all(date, date));
});
payrollRouter.post('/attendance', allow(ACC), (req, res) => {
  const { date, records } = req.body;
  if (!date || !Array.isArray(records)) throw bad('Date and records are required');
  const up = db.prepare(`INSERT INTO employee_attendance(employee_id, date, status, check_in, check_out, hours_worked) VALUES (?,?,?,?,?,?)
    ON CONFLICT(employee_id, date) DO UPDATE SET status=excluded.status, check_in=excluded.check_in, check_out=excluded.check_out, hours_worked=excluded.hours_worked`);
  const del = db.prepare('DELETE FROM employee_attendance WHERE employee_id=? AND date=?');
  tx(() => records.forEach(r => {
    if (!r.status) return del.run(r.employee_id, date);
    const std = db.prepare('SELECT std_hours_per_day FROM employees WHERE id=?').get(r.employee_id)?.std_hours_per_day || 8;
    let hrs = hoursFrom(r.check_in, r.check_out) ?? (r.hours_worked !== '' && r.hours_worked != null ? Number(r.hours_worked) : null);
    if (hrs == null) hrs = r.status === 'P' ? std : r.status === 'HD' ? std / 2 : 0;
    if (r.status === 'A' || r.status === 'L') hrs = 0;
    up.run(r.employee_id, date, r.status, r.check_in || null, r.check_out || null, hrs);
  }));
  res.json({ ok: true });
});
payrollRouter.get('/attendance/summary', allow(ACC), (req, res) => {
  const month = req.query.month || today().slice(0, 7);
  res.json(db.prepare(`SELECT e.id, e.emp_code, e.name, e.profession,
      SUM(a.status='P') AS present, SUM(a.status='HD') AS half_days, SUM(a.status='L') AS paid_leave, SUM(a.status='A') AS absent,
      ROUND(COALESCE(SUM(a.hours_worked),0),2) AS hours
    FROM employees e LEFT JOIN employee_attendance a ON a.employee_id=e.id AND a.date LIKE ?
    WHERE e.status='Active' GROUP BY e.id ORDER BY e.emp_code`).all(`${month}%`));
});

// ---------- Holidays & adjustments ----------
payrollRouter.get('/holidays', allow(ACC), (req, res) => res.json(db.prepare('SELECT * FROM holidays ORDER BY date').all()));
payrollRouter.post('/holidays', allow(ACC), (req, res) => {
  if (!req.body.date) throw bad('Date is required');
  res.json({ id: insert(db, 'holidays', pick(req.body, ['date', 'name'])) });
});
payrollRouter.delete('/holidays/:id', allow(ACC), (req, res) => { db.prepare('DELETE FROM holidays WHERE id=?').run(req.params.id); res.json({ ok: true }); });

export const EARNING_ADJ = ['Bonus', 'Arrears', 'Incentive', 'Reimbursement'];
export const DEDUCTION_ADJ = ['Salary Advance Recovery', 'Loan Recovery', 'Other Deduction'];
payrollRouter.get('/adjustments', allow(ACC), (req, res) => {
  res.json(db.prepare(`SELECT a.*, e.name, e.emp_code FROM payroll_adjustments a JOIN employees e ON e.id=a.employee_id
    ${req.query.month ? 'WHERE a.month=?' : ''} ORDER BY a.month DESC, e.emp_code`).all(...(req.query.month ? [req.query.month] : [])));
});
payrollRouter.post('/adjustments', allow(ACC), (req, res) => {
  const d = pick(req.body, ['employee_id', 'month', 'type', 'amount', 'note']);
  if (!d.employee_id || !d.month || ![...EARNING_ADJ, ...DEDUCTION_ADJ].includes(d.type) || !(Number(d.amount) > 0)) throw bad('Employee, month, valid type and amount are required');
  res.json({ id: insert(db, 'payroll_adjustments', d) });
});
payrollRouter.delete('/adjustments/:id', allow(ACC), (req, res) => { db.prepare('DELETE FROM payroll_adjustments WHERE id=?').run(req.params.id); res.json({ ok: true }); });

// ---------- Salary computation ----------
function workingDays(month) {
  const [y, m] = month.split('-').map(Number);
  const holidays = new Set(db.prepare('SELECT date FROM holidays WHERE date LIKE ?').all(`${month}%`).map(h => h.date));
  const days = [];
  for (let d = 1; d <= new Date(Date.UTC(y, m, 0)).getUTCDate(); d++) {
    const dt = new Date(Date.UTC(y, m - 1, d));
    const iso = dt.toISOString().slice(0, 10);
    if (dt.getUTCDay() !== 0 && !holidays.has(iso)) days.push(iso);
  }
  return days;
}

/**
 * Monthly-paid staff: fixed components are pro-rated by payable days (present + paid leave + ½ half-days);
 *   hours beyond the standard working day are paid as overtime at the hourly equivalent × OT multiplier.
 * Hourly-paid staff: total hours worked × hourly rate.
 * Statutory deductions: EPF 12% of (Basic+DA) up to the wage ceiling, ESI 0.75% when gross ≤ ₹21,000,
 *   Professional Tax (state-specific, configurable), TDS (monthly amount from the employee's declaration).
 */
export function computeSalary(e, month, { unmarkedAs = 'Absent' } = {}) {
  const days = workingDays(month);
  const att = Object.fromEntries(db.prepare('SELECT * FROM employee_attendance WHERE employee_id=? AND date LIKE ?').all(e.id, `${month}%`).map(a => [a.date, a]));
  const std = Number(e.std_hours_per_day) || 8;
  let present = 0, half = 0, leave = 0, absent = 0, unmarked = 0, notEmployed = 0, hours = 0, otHours = 0;
  for (const d of days) {
    if ((e.join_date && d < e.join_date) || (e.exit_date && d > e.exit_date)) { notEmployed++; continue; }
    const a = att[d];
    if (!a) { unmarked++; if (unmarkedAs === 'Present') { present++; hours += std; } else absent++; continue; }
    if (a.status === 'P') present++; else if (a.status === 'HD') half++; else if (a.status === 'L') leave++; else absent++;
    hours += a.hours_worked || 0;
    const expected = a.status === 'P' ? std : a.status === 'HD' ? std / 2 : 0;
    if (expected) otHours += Math.max(0, (a.hours_worked || 0) - expected);
  }
  // Work on Sundays / holidays counts fully as overtime
  for (const [d, a] of Object.entries(att)) if (!days.includes(d) && a.hours_worked) { hours += a.hours_worked; otHours += a.hours_worked; }

  const wd = days.length;
  const payable = present + leave + half * 0.5;
  const earnings = [], deductions = [], employer = [];
  let basicE = 0, daE = 0;
  if (e.pay_type === 'Hourly') {
    earnings.push({ name: `Wages (${round2(hours)} h × ₹${e.hourly_rate})`, amount: round2(hours * e.hourly_rate) });
    basicE = round2(hours * e.hourly_rate);
  } else {
    const f = wd ? payable / wd : 0;
    basicE = round2(e.basic * f); daE = round2(e.da * f);
    earnings.push({ name: 'Basic', amount: basicE }, { name: 'Dearness Allowance (DA)', amount: daE },
      { name: 'House Rent Allowance (HRA)', amount: round2(e.hra * f) }, { name: 'Other Allowances', amount: round2(e.other_allowance * f) });
    if (otHours > 0) {
      const rate = wd ? (Number(e.basic) + Number(e.da)) / (wd * std) * num('ot_multiplier') : 0;
      earnings.push({ name: `Overtime (${round2(otHours)} h × ₹${round2(rate)})`, amount: round2(otHours * rate) });
    }
  }
  const adj = db.prepare('SELECT * FROM payroll_adjustments WHERE employee_id=? AND month=?').all(e.id, month);
  for (const a of adj.filter(a => EARNING_ADJ.includes(a.type))) earnings.push({ name: a.type + (a.note ? ` – ${a.note}` : ''), amount: round2(a.amount) });
  const gross = round2(earnings.reduce((s, x) => s + x.amount, 0));

  if (Number(e.pf_enabled)) {
    const pfWage = Math.min(basicE + daE, num('pf_wage_ceiling'));
    const pf = Math.round(pfWage * num('pf_rate') / 100);
    deductions.push({ name: 'Provident Fund (EPF) – Employee', amount: pf });
    employer.push({ name: 'EPF + EPS – Employer', amount: pf });
  }
  if (Number(e.esi_enabled) && gross > 0 && gross <= num('esi_wage_limit')) {
    deductions.push({ name: 'ESI – Employee', amount: Math.ceil(gross * num('esi_employee_rate') / 100) });
    employer.push({ name: 'ESI – Employer', amount: Math.ceil(gross * num('esi_employer_rate') / 100) });
  }
  if (Number(e.pt_enabled) && gross > num('pt_threshold')) deductions.push({ name: 'Professional Tax', amount: num('pt_amount') });
  if (Number(e.tds_monthly) > 0) deductions.push({ name: 'TDS (Income Tax)', amount: round2(e.tds_monthly) });
  for (const a of adj.filter(a => DEDUCTION_ADJ.includes(a.type))) deductions.push({ name: a.type + (a.note ? ` – ${a.note}` : ''), amount: round2(a.amount) });
  const total_deductions = round2(deductions.reduce((s, x) => s + x.amount, 0));

  return {
    gross, total_deductions, net_pay: round2(Math.max(0, gross - total_deductions)),
    details: { working_days: wd, present, half_days: half, paid_leave: leave, absent, unmarked, not_employed: notEmployed,
      payable_days: payable, lop_days: wd - notEmployed - payable, total_hours: round2(hours), ot_hours: round2(otHours),
      unmarked_treated_as: unmarkedAs, earnings: earnings.filter(x => x.amount), deductions, employer,
      snapshot: pick(e, ['emp_code', 'name', 'profession', 'department', 'pan', 'uan', 'bank_name', 'bank_account', 'ifsc', 'pay_type', 'join_date', 'father_name']) },
  };
}

payrollRouter.post('/run', allow(ACC), (req, res) => {
  const { month, unmarked_as } = req.body;
  if (!/^\d{4}-\d{2}$/.test(month || '')) throw bad('Month (YYYY-MM) is required');
  const start = `${month}-01`, end = `${month}-31`;
  const emps = db.prepare(`SELECT * FROM employees WHERE (join_date IS NULL OR join_date<=?) AND (status='Active' OR exit_date>=?)`).all(end, start);
  let processed = 0, locked = 0;
  const up = db.prepare(`INSERT INTO payroll(employee_id, month, details, gross, total_deductions, net_pay, status) VALUES (?,?,?,?,?,?, 'Processed')
    ON CONFLICT(employee_id, month) DO UPDATE SET details=excluded.details, gross=excluded.gross, total_deductions=excluded.total_deductions, net_pay=excluded.net_pay`);
  tx(() => {
    for (const e of emps) {
      if (db.prepare("SELECT 1 FROM payroll WHERE employee_id=? AND month=? AND status='Paid'").get(e.id, month)) { locked++; continue; }
      const s = computeSalary(e, month, { unmarkedAs: unmarked_as === 'Present' ? 'Present' : 'Absent' });
      up.run(e.id, month, JSON.stringify(s.details), s.gross, s.total_deductions, s.net_pay);
      processed++;
    }
  });
  res.json({ processed, locked });
});

const PR_SQL = `SELECT p.*, e.emp_code, e.name, e.profession, e.department, e.bank_account, e.ifsc FROM payroll p JOIN employees e ON e.id=p.employee_id`;
const parse = (p) => ({ ...p, details: JSON.parse(p.details) });
payrollRouter.get('/', allow(ACC), (req, res) => {
  const month = req.query.month || today().slice(0, 7);
  const rows = db.prepare(`${PR_SQL} WHERE p.month=? ORDER BY e.emp_code`).all(month).map(parse);
  res.json({ month, rows, totals: { gross: round2(rows.reduce((a, r) => a + r.gross, 0)), deductions: round2(rows.reduce((a, r) => a + r.total_deductions, 0)), net: round2(rows.reduce((a, r) => a + r.net_pay, 0)) } });
});
payrollRouter.get('/my', allow('admin', 'accountant', 'teacher', 'driver', 'librarian'), (req, res) => {
  res.json(db.prepare(`${PR_SQL} WHERE e.user_id=? ORDER BY p.month DESC`).all(req.user.id).map(parse));
});
payrollRouter.get('/:id', (req, res) => {
  const p = db.prepare(`${PR_SQL} WHERE p.id=?`).get(req.params.id);
  if (!p) throw notFound('Payslip');
  const own = db.prepare('SELECT user_id FROM employees WHERE id=?').get(p.employee_id)?.user_id === req.user.id;
  if (!own && !['admin', ACC].includes(req.user.role)) throw bad('Not allowed');
  res.json(parse(p));
});
payrollRouter.post('/pay', allow(ACC), (req, res) => {
  const { ids, payment_mode = 'Bank Transfer', payment_ref, paid_on } = req.body;
  if (!Array.isArray(ids) || !ids.length) throw bad('Select at least one payslip');
  const st = db.prepare("UPDATE payroll SET status='Paid', paid_on=?, payment_mode=?, payment_ref=? WHERE id=? AND status!='Paid'");
  let n = 0; tx(() => ids.forEach(id => { n += Number(st.run(paid_on || today(), payment_mode, payment_ref || null, id).changes); }));
  res.json({ paid: n });
});
payrollRouter.delete('/:id', allow(ACC), (req, res) => {
  db.prepare("DELETE FROM payroll WHERE id=? AND status!='Paid'").run(req.params.id); res.json({ ok: true });
});
