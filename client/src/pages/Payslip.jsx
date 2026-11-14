import { useAuth, Modal, inr, fmtDate, monthLabel, Badge } from '../ui.jsx';
import { inWords } from './FeeDocs.jsx';

export default function Payslip({ p, onClose }) {
  const { school } = useAuth();
  const d = p.details, s = d.snapshot || {};
  const rows = Math.max(d.earnings.length, d.deductions.length);
  return (<Modal wide title={`Payslip – ${monthLabel(p.month)}`} onClose={onClose} footer={<button className="btn" onClick={() => window.print()}>Print / Save PDF</button>}>
    <div className="stack">
      <div style={{ textAlign: 'center' }}><h2 style={{ margin: 0 }}>{school.school_name}</h2><div className="small muted">{school.school_address}</div><b>Salary slip for {monthLabel(p.month)}</b></div>
      <div className="form-grid small">
        <div><span className="muted">Employee</span><br /><b>{s.name || p.name}</b> ({s.emp_code || p.emp_code})</div><div><span className="muted">Designation</span><br /><b>{s.profession || p.profession}</b></div>
        <div><span className="muted">Department</span><br /><b>{s.department || '—'}</b></div><div><span className="muted">Date of joining</span><br /><b>{fmtDate(s.join_date)}</b></div>
        <div><span className="muted">PAN / UAN</span><br /><b>{s.pan || '—'} / {s.uan || '—'}</b></div><div><span className="muted">Bank A/c</span><br /><b>{s.bank_name} {s.bank_account} {s.ifsc}</b></div>
        <div><span className="muted">Working days / Payable days</span><br /><b>{d.working_days} / {d.payable_days}</b>{d.lop_days > 0 && <span className="muted"> (LOP {d.lop_days})</span>}</div>
        <div><span className="muted">Hours worked / Overtime</span><br /><b>{d.total_hours} h / {d.ot_hours} h</b></div>
      </div>
      <div className="small muted">Present {d.present} · Half days {d.half_days} · Paid leave {d.paid_leave} · Absent {d.absent}{d.unmarked ? ` · Unmarked ${d.unmarked} (treated as ${d.unmarked_treated_as})` : ''}</div>
      <div className="table-wrap"><table><thead><tr><th>Earnings</th><th className="num">Amount</th><th>Deductions</th><th className="num">Amount</th></tr></thead>
        <tbody>{Array.from({ length: rows }, (_, i) => <tr key={i}><td>{d.earnings[i]?.name}</td><td className="num">{d.earnings[i] && inr(d.earnings[i].amount)}</td><td>{d.deductions[i]?.name}</td><td className="num">{d.deductions[i] && inr(d.deductions[i].amount)}</td></tr>)}</tbody>
        <tfoot><tr><td>Gross earnings</td><td className="num">{inr(p.gross)}</td><td>Total deductions</td><td className="num">{inr(p.total_deductions)}</td></tr></tfoot></table></div>
      <div className="card row"><div><div className="muted small">Net pay</div><div style={{ fontSize: 26, fontWeight: 700 }}>{inr(p.net_pay)}</div><div className="small">{inWords(p.net_pay)}</div></div><div className="spacer" />
        <div className="right"><Badge>{p.status}</Badge>{p.paid_on && <div className="small muted">Paid {fmtDate(p.paid_on)} via {p.payment_mode}</div>}</div></div>
      {!!d.employer?.length && <div className="small muted">Employer contributions (not deducted from salary): {d.employer.map(e => `${e.name} ${inr(e.amount)}`).join(' · ')}</div>}
    </div>
  </Modal>);
}
