import { useState, useEffect } from 'react';
import { post, put, del, qs } from '../api.js';
import { useData, Page, Modal, Field, Loading, ErrorBox, Badge, Stat, run, confirmDo, inr, fmtDate, monthLabel, todayISO, thisMonth } from '../ui.jsx';
import Payslip from './Payslip.jsx';

const EMP_FIELDS = (users) => [
  ['Personal details', [
    { name: 'name', label: 'Full name', required: true }, { name: 'father_name', label: "Father's name" }, { name: 'mother_name', label: "Mother's name" },
    { name: 'dob', label: 'Date of birth', type: 'date' }, { name: 'gender', label: 'Gender', type: 'select', options: ['Male', 'Female', 'Other'] },
    { name: 'phone', label: 'Mobile', type: 'tel' }, { name: 'email', label: 'Email', type: 'email' }, { name: 'address', label: 'Address', type: 'textarea', full: true }]],
  ['Employment', [
    { name: 'emp_code', label: 'Employee code', hint: 'Auto-generated if blank' }, { name: 'profession', label: 'Profession / Designation', required: true, placeholder: 'e.g. PGT Physics, Bus Driver' },
    { name: 'department', label: 'Department', type: 'select', options: ['Academics', 'Administration', 'Accounts', 'Library', 'Transport', 'Support Staff', 'Maintenance'] },
    { name: 'join_date', label: 'Date of joining', type: 'date' },
    { name: 'user_id', label: 'Linked login (for viewing own payslips)', type: 'select', options: () => users.map(u => ({ value: u.id, label: `${u.name} (${u.role})` })), placeholder: 'None' }]],
  ['Salary', [
    { name: 'pay_type', label: 'Pay type', type: 'select', options: ['Monthly', 'Hourly'], noBlank: true },
    { name: 'basic', label: 'Basic (₹/month)', type: 'number', min: 0, show: (e) => e.pay_type !== 'Hourly' }, { name: 'da', label: 'Dearness Allowance (₹/month)', type: 'number', min: 0, show: (e) => e.pay_type !== 'Hourly' },
    { name: 'hra', label: 'HRA (₹/month)', type: 'number', min: 0, show: (e) => e.pay_type !== 'Hourly' }, { name: 'other_allowance', label: 'Other allowances (₹/month)', type: 'number', min: 0, show: (e) => e.pay_type !== 'Hourly' },
    { name: 'hourly_rate', label: 'Hourly rate (₹)', type: 'number', min: 0, show: (e) => e.pay_type === 'Hourly' },
    { name: 'std_hours_per_day', label: 'Standard hours per day', type: 'number', step: '0.5', min: 1, hint: 'Hours beyond this are paid as overtime' },
    { name: 'tds_monthly', label: 'TDS per month (₹)', type: 'number', min: 0 },
    { name: 'pf_enabled', label: 'Provident Fund (EPF)', type: 'checkbox' }, { name: 'esi_enabled', label: 'ESI (if gross ≤ ₹21,000)', type: 'checkbox' }, { name: 'pt_enabled', label: 'Professional Tax', type: 'checkbox' }]],
  ['Statutory & bank', [
    { name: 'pan', label: 'PAN' }, { name: 'aadhaar', label: 'Aadhaar' }, { name: 'uan', label: 'UAN (EPF)' },
    { name: 'bank_name', label: 'Bank name' }, { name: 'bank_account', label: 'Account number' }, { name: 'ifsc', label: 'IFSC' }]],
];

function Employees() {
  const [status, setStatus] = useState('Active');
  const [q, setQ] = useState('');
  const [rows, reload, { error }] = useData('/payroll/employees' + qs({ status, q }));
  const [users] = useData('/users/staff');
  const [edit, setEdit] = useState(null);
  const [removing, setRemoving] = useState(null);
  const save = async (e) => {
    e.preventDefault();
    const { username, id, status: _s, ...body } = edit;
    if (await run(() => id ? put(`/payroll/employees/${id}`, body) : post('/payroll/employees', body), id ? 'Employee updated' : 'Employee added')) { setEdit(null); reload(); }
  };
  const remove = async () => { if (await run(() => del(`/payroll/employees/${removing.id}`, { exit_date: removing.exit_date, exit_reason: removing.exit_reason }), 'Employee removed')) { setRemoving(null); reload(); } };
  const purge = async (e) => { if (confirmDo(`Permanently delete ${e.name}? Only possible if no payroll has been processed.`) && await run(() => del(`/payroll/employees/${e.id}?permanent=1`), 'Deleted')) reload(); };
  return (<div className="stack">
    <div className="row"><div className="seg">{['Active', 'Removed', 'All'].map(s => <button key={s} className={status === s ? 'on' : ''} onClick={() => setStatus(s)}>{s}</button>)}</div>
      <input style={{ maxWidth: 260 }} placeholder="Search name / code / profession" value={q} onChange={(e) => setQ(e.target.value)} /><div className="spacer" />
      <button className="btn" onClick={() => setEdit({ pay_type: 'Monthly', std_hours_per_day: 8, pf_enabled: 1, esi_enabled: 1, pt_enabled: 1, join_date: todayISO() })}>＋ Add employee</button></div>
    <ErrorBox error={error} />
    {!rows ? <Loading /> : <div className="card flush"><div className="table-wrap"><table>
      <thead><tr><th>Code</th><th>Name</th><th>Profession</th><th className="hide-sm">Pay</th><th className="hide-sm">Joined</th><th>Status</th><th /></tr></thead>
      <tbody>{rows.map(e => <tr key={e.id}><td>{e.emp_code}</td><td><b>{e.name}</b><div className="small muted">S/o, D/o {e.father_name || '—'}</div></td><td>{e.profession}<div className="small muted">{e.department}</div></td>
        <td className="hide-sm nowrap">{e.pay_type === 'Hourly' ? `${inr(e.hourly_rate)}/hour` : `${inr(e.basic + e.da + e.hra + e.other_allowance)}/month`}</td>
        <td className="hide-sm nowrap">{fmtDate(e.join_date)}</td><td><Badge>{e.status}</Badge>{e.exit_date && <div className="small muted">Left {fmtDate(e.exit_date)}</div>}</td>
        <td className="nowrap right"><button className="btn sm secondary" onClick={() => setEdit(e)}>Edit</button>{' '}
          {e.status === 'Active' ? <button className="btn sm secondary" onClick={() => setRemoving({ ...e, exit_date: todayISO() })}>Remove</button>
            : <><button className="btn sm secondary" onClick={async () => { if (await run(() => post(`/payroll/employees/${e.id}/restore`), 'Restored')) reload(); }}>Restore</button>{' '}
              <button className="btn sm ghost" onClick={() => purge(e)} aria-label="Delete permanently">🗑</button></>}</td></tr>)}</tbody></table>
      {!rows.length && <div className="empty">No employees.</div>}</div></div>}
    {edit && <Modal wide title={edit.id ? `Edit ${edit.name}` : 'Add employee'} onClose={() => setEdit(null)} footer={<><button className="btn secondary" onClick={() => setEdit(null)}>Cancel</button><button className="btn" form="ef">Save</button></>}>
      <form id="ef" className="stack" onSubmit={save}>{EMP_FIELDS(users || []).map(([g, fs]) => <div key={g}><h3>{g}</h3><div className="form-grid">
        {fs.filter(f => !f.show || f.show(edit)).map(f => <Field key={f.name} f={f} value={edit[f.name]} onChange={(k, v) => setEdit(p => ({ ...p, [k]: v }))} />)}</div></div>)}
        {edit.pay_type !== 'Hourly' && <div className="alert info">Monthly gross: <b>{inr(['basic', 'da', 'hra', 'other_allowance'].reduce((a, k) => a + Number(edit[k] || 0), 0))}</b> · CTC/year (incl. employer EPF): approx. <b>{inr(12 * (['basic', 'da', 'hra', 'other_allowance'].reduce((a, k) => a + Number(edit[k] || 0), 0) + (Number(edit.pf_enabled) ? Math.round(Math.min(Number(edit.basic || 0) + Number(edit.da || 0), 15000) * 0.12) : 0)))}</b></div>}
      </form></Modal>}
    {removing && <Modal title={`Remove ${removing.name}`} onClose={() => setRemoving(null)} footer={<><button className="btn secondary" onClick={() => setRemoving(null)}>Cancel</button><button className="btn danger" onClick={remove}>Remove employee</button></>}>
      <div className="stack"><div className="small muted">The employee is moved to "Removed", their login (if any) is disabled, and payroll history is preserved. Salary for the final month is pro-rated up to the last working day.</div>
        <label className="f">Last working day<input type="date" value={removing.exit_date} onChange={(e) => setRemoving({ ...removing, exit_date: e.target.value })} /></label>
        <label className="f">Reason<select value={removing.exit_reason || ''} onChange={(e) => setRemoving({ ...removing, exit_reason: e.target.value })}><option value="">—</option>{['Resigned', 'Retired', 'Terminated', 'Contract ended', 'Other'].map(x => <option key={x}>{x}</option>)}</select></label></div></Modal>}
  </div>);
}

function EmpAttendance() {
  const [date, setDate] = useState(todayISO());
  const [rows, reload] = useData('/payroll/attendance' + qs({ date }));
  const [m, setM] = useState({});
  useEffect(() => { if (rows) setM(Object.fromEntries(rows.map(r => [r.employee_id, { status: r.status || '', check_in: r.check_in || '', check_out: r.check_out || '', hours_worked: r.hours_worked ?? '' }]))); }, [rows]);
  const set = (id, k, v) => setM({ ...m, [id]: { ...m[id], [k]: v } });
  const save = async () => { if (await run(() => post('/payroll/attendance', { date, records: Object.entries(m).map(([employee_id, v]) => ({ employee_id: Number(employee_id), ...v })) }), 'Attendance saved')) reload(); };
  return (<div className="stack">
    <div className="row"><input type="date" style={{ width: 'auto' }} value={date} onChange={(e) => setDate(e.target.value)} /><div className="spacer" />
      <button className="btn secondary sm" onClick={() => setM(Object.fromEntries(Object.entries(m).map(([k, v]) => [k, { ...v, status: v.status || 'P' }])))}>Mark unmarked as present</button></div>
    <div className="small muted">Status: P = Present, HD = Half day, L = Paid leave, A = Absent. Enter check-in/check-out times (hours are calculated) or hours directly. Hours beyond the standard day are paid as overtime; hourly staff are paid for hours worked.</div>
    {!rows ? <Loading /> : <div className="card flush"><div className="table-wrap"><table>
      <thead><tr><th>Employee</th><th>Status</th><th>In</th><th>Out</th><th>Hours</th></tr></thead>
      <tbody>{rows.map(r => <tr key={r.employee_id}><td><b>{r.name}</b><div className="small muted">{r.emp_code} · {r.pay_type} · std {r.std_hours_per_day}h</div></td>
        <td><div className="seg">{['P', 'HD', 'L', 'A'].map(s => <button key={s} className={m[r.employee_id]?.status === s ? 'on' : ''} onClick={() => set(r.employee_id, 'status', m[r.employee_id]?.status === s ? '' : s)}>{s}</button>)}</div></td>
        <td><input type="time" style={{ width: 110 }} value={m[r.employee_id]?.check_in || ''} onChange={(e) => set(r.employee_id, 'check_in', e.target.value)} /></td>
        <td><input type="time" style={{ width: 110 }} value={m[r.employee_id]?.check_out || ''} onChange={(e) => set(r.employee_id, 'check_out', e.target.value)} /></td>
        <td><input type="number" step="0.25" min="0" style={{ width: 80 }} value={m[r.employee_id]?.hours_worked ?? ''} onChange={(e) => set(r.employee_id, 'hours_worked', e.target.value)} /></td></tr>)}</tbody></table></div>
      <div className="card-head"><div className="spacer" /><button className="btn" onClick={save}>Save attendance</button></div></div>}
  </div>);
}

function Adjustments() {
  const [month, setMonth] = useState(thisMonth());
  const [rows, reload] = useData('/payroll/adjustments' + qs({ month }));
  const [emps] = useData('/payroll/employees');
  const [hol, reloadH] = useData('/payroll/holidays');
  const [f, setF] = useState({ type: 'Bonus' });
  const [h, setH] = useState({});
  return (<div className="grid">
    <div className="card stack"><h2>Bonuses, advances & deductions</h2>
      <form className="form-grid" onSubmit={async (e) => { e.preventDefault(); if (await run(() => post('/payroll/adjustments', { ...f, month }), 'Added')) { setF({ type: f.type }); reload(); } }}>
        <label className="f">Month<input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></label>
        <label className="f">Employee<select value={f.employee_id || ''} onChange={(e) => setF({ ...f, employee_id: e.target.value })} required><option value="">—</option>{(emps || []).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
        <label className="f">Type<select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><optgroup label="Earnings">{['Bonus', 'Arrears', 'Incentive', 'Reimbursement'].map(x => <option key={x}>{x}</option>)}</optgroup>
          <optgroup label="Deductions">{['Salary Advance Recovery', 'Loan Recovery', 'Other Deduction'].map(x => <option key={x}>{x}</option>)}</optgroup></select></label>
        <label className="f">Amount (₹)<input type="number" min="1" value={f.amount || ''} onChange={(e) => setF({ ...f, amount: e.target.value })} required /></label>
        <label className="f full">Note<input value={f.note || ''} onChange={(e) => setF({ ...f, note: e.target.value })} /></label><div><button className="btn">Add</button></div></form>
      <table><tbody>{(rows || []).map(a => <tr key={a.id}><td>{a.name}</td><td><Badge tone={/Recovery|Deduction/.test(a.type) ? 'bad' : 'ok'}>{a.type}</Badge><div className="small muted">{a.note}</div></td><td className="num">{inr(a.amount)}</td>
        <td><button className="btn sm ghost" onClick={async () => { if (await run(() => del(`/payroll/adjustments/${a.id}`))) reload(); }}>🗑</button></td></tr>)}</tbody></table>
      {rows && !rows.length && <div className="muted small">No adjustments for {monthLabel(month)}.</div>}</div>
    <div className="card stack"><h2>Holidays</h2><div className="small muted">Sundays and these dates are excluded from working days in payroll.</div>
      <form className="row" onSubmit={async (e) => { e.preventDefault(); if (await run(() => post('/payroll/holidays', h), 'Holiday added')) { setH({}); reloadH(); } }}>
        <input type="date" style={{ flex: 1 }} value={h.date || ''} onChange={(e) => setH({ ...h, date: e.target.value })} required /><input style={{ flex: 2 }} placeholder="e.g. Diwali" value={h.name || ''} onChange={(e) => setH({ ...h, name: e.target.value })} /><button className="btn">Add</button></form>
      <table><tbody>{(hol || []).map(x => <tr key={x.id}><td className="nowrap">{fmtDate(x.date)}</td><td>{x.name}</td><td className="right"><button className="btn sm ghost" onClick={async () => { if (await run(() => del(`/payroll/holidays/${x.id}`))) reloadH(); }}>🗑</button></td></tr>)}</tbody></table></div>
  </div>);
}

function Run() {
  const [month, setMonth] = useState(thisMonth());
  const [unmarked, setUnmarked] = useState('Absent');
  const [d, reload] = useData('/payroll' + qs({ month }));
  const [sel, setSel] = useState([]);
  const [view, setView] = useState(null);
  const [pay, setPay] = useState(null);
  const process = async () => { const r = await run(() => post('/payroll/run', { month, unmarked_as: unmarked }), (r) => `Processed ${r.processed} employees${r.locked ? ` (${r.locked} already paid – unchanged)` : ''}`); if (r) reload(); };
  const markPaid = async () => { if (await run(() => post('/payroll/pay', { ids: sel, ...pay }), (r) => `${r.paid} marked as paid`)) { setSel([]); setPay(null); reload(); } };
  const exportCsv = () => {
    const lines = [['Emp Code', 'Name', 'Bank Account', 'IFSC', 'Net Pay', 'Narration'], ...d.rows.map(r => [r.emp_code, r.name, r.bank_account || '', r.ifsc || '', r.net_pay, `Salary ${month}`])];
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([lines.map(l => l.map(x => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n')], { type: 'text/csv' }));
    a.download = `salary-bank-transfer-${month}.csv`; a.click();
  };
  const unpaid = d?.rows.filter(r => r.status !== 'Paid') || [];
  return (<div className="stack">
    <div className="card row">
      <label className="f">Month<input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></label>
      <label className="f">Days without attendance<select value={unmarked} onChange={(e) => setUnmarked(e.target.value)}><option value="Absent">Treat as absent (LOP)</option><option value="Present">Treat as present</option></select></label>
      <div className="spacer" /><button className="btn" onClick={process}>⚙️ Calculate payroll</button></div>
    <div className="small muted">Salary = fixed components × (payable days ÷ working days) + overtime + bonuses − EPF (12% of Basic+DA up to ₹15,000) − ESI (0.75% if gross ≤ ₹21,000) − Professional Tax − TDS − recoveries. Hourly staff: hours worked × hourly rate. Paid payslips are locked; re-calculating updates the others.</div>
    {!d ? <Loading /> : <>
      <div className="grid-stats"><Stat label="Employees" value={d.rows.length} icon="👥" /><Stat label="Gross" value={inr(d.totals.gross)} icon="💵" /><Stat label="Deductions" value={inr(d.totals.deductions)} icon="➖" /><Stat label="Net payable" value={inr(d.totals.net)} icon="🏦" tone="ok" /></div>
      <div className="card flush"><div className="card-head"><b>{monthLabel(month)}</b><div className="spacer" />
        {!!d.rows.length && <button className="btn sm secondary" onClick={exportCsv}>⬇ Bank transfer CSV</button>}
        <button className="btn sm ok" disabled={!sel.length} onClick={() => setPay({ payment_mode: 'Bank Transfer', paid_on: todayISO() })}>Mark {sel.length || ''} as paid</button></div>
        <div className="table-wrap"><table><thead><tr><th><input type="checkbox" aria-label="Select all" checked={!!unpaid.length && sel.length === unpaid.length} onChange={(e) => setSel(e.target.checked ? unpaid.map(r => r.id) : [])} /></th>
          <th>Employee</th><th className="num">Days</th><th className="num hide-sm">Hours / OT</th><th className="num">Gross</th><th className="num">Deductions</th><th className="num">Net</th><th>Status</th><th /></tr></thead>
          <tbody>{d.rows.map(r => <tr key={r.id}><td>{r.status !== 'Paid' && <input type="checkbox" checked={sel.includes(r.id)} onChange={(e) => setSel(e.target.checked ? [...sel, r.id] : sel.filter(x => x !== r.id))} />}</td>
            <td><b>{r.name}</b><div className="small muted">{r.emp_code} · {r.profession}</div></td><td className="num">{r.details.payable_days}/{r.details.working_days}</td>
            <td className="num hide-sm">{r.details.total_hours} / {r.details.ot_hours}</td><td className="num">{inr(r.gross)}</td><td className="num">{inr(r.total_deductions)}</td><td className="num"><b>{inr(r.net_pay)}</b></td>
            <td><Badge>{r.status}</Badge></td><td className="right nowrap"><button className="btn sm secondary" onClick={() => setView(r)}>Payslip</button></td></tr>)}</tbody></table>
          {!d.rows.length && <div className="empty">Payroll not calculated for {monthLabel(month)} yet. Mark staff attendance, then click "Calculate payroll".</div>}</div></div></>}
    {view && <Payslip p={view} onClose={() => setView(null)} />}
    {pay && <Modal title={`Mark ${sel.length} payslip(s) as paid`} onClose={() => setPay(null)} footer={<button className="btn ok" onClick={markPaid}>Confirm</button>}>
      <div className="form-grid">{[{ name: 'payment_mode', label: 'Mode', type: 'select', options: ['Bank Transfer', 'Cheque', 'Cash', 'UPI'], noBlank: true }, { name: 'paid_on', label: 'Paid on', type: 'date' }, { name: 'payment_ref', label: 'Reference / batch no.' }]
        .map(x => <Field key={x.name} f={x} value={pay[x.name]} onChange={(k, v) => setPay({ ...pay, [k]: v })} />)}</div></Modal>}
  </div>);
}

function Summary() {
  const [month, setMonth] = useState(thisMonth());
  const [rows] = useData('/payroll/attendance/summary' + qs({ month }));
  return (<div className="stack"><input type="month" style={{ width: 'auto' }} value={month} onChange={(e) => setMonth(e.target.value)} />
    {!rows ? <Loading /> : <div className="card flush"><div className="table-wrap"><table><thead><tr><th>Employee</th><th className="num">Present</th><th className="num">Half days</th><th className="num">Paid leave</th><th className="num">Absent</th><th className="num">Hours</th></tr></thead>
      <tbody>{rows.map(r => <tr key={r.id}><td>{r.name}<div className="small muted">{r.emp_code} · {r.profession}</div></td><td className="num">{r.present || 0}</td><td className="num">{r.half_days || 0}</td><td className="num">{r.paid_leave || 0}</td><td className="num">{r.absent || 0}</td><td className="num">{r.hours}</td></tr>)}</tbody></table></div></div>}</div>);
}

const TABS = [['Run Payroll', Run], ['Employees', Employees], ['Attendance & Hours', EmpAttendance], ['Monthly Attendance', Summary], ['Adjustments & Holidays', Adjustments]];
export default function Payroll() {
  const [tab, setTab] = useState(0);
  const Comp = TABS[tab][1];
  return (<Page title="Payroll" sub="Employees, attendance & hours, automatic salary calculation with EPF / ESI / PT / TDS, payslips">
    <div className="tabs">{TABS.map(([l], i) => <button key={l} className={tab === i ? 'on' : ''} onClick={() => setTab(i)}>{l}</button>)}</div><Comp />
  </Page>);
}
