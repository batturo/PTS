import { useAuth, inr, fmtDate, monthLabel, Badge, Modal, useData, Loading } from '../ui.jsx';

/** Converts a rupee amount into Indian-English words (lakh / crore system). */
export function inWords(n) {
  const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two = (x) => x < 20 ? a[x] : b[Math.floor(x / 10)] + (x % 10 ? ' ' + a[x % 10] : '');
  const three = (x) => (x >= 100 ? a[Math.floor(x / 100)] + ' Hundred' + (x % 100 ? ' ' : '') : '') + two(x % 100);
  let r = Math.floor(n), out = [];
  const crore = Math.floor(r / 1e7); r %= 1e7; const lakh = Math.floor(r / 1e5); r %= 1e5; const th = Math.floor(r / 1000); r %= 1000;
  if (crore) out.push(three(crore) + ' Crore'); if (lakh) out.push(two(lakh) + ' Lakh'); if (th) out.push(two(th) + ' Thousand'); if (r) out.push(three(r));
  const p = Math.round((n % 1) * 100);
  return 'Rupees ' + (out.join(' ') || 'Zero') + (p ? ` and ${two(p)} Paise` : '') + ' Only';
}

export function InvoiceView({ id, onClose, extra }) {
  const { school } = useAuth();
  const [inv] = useData(`/fees/invoices/${id}`);
  return (<Modal title="Fee invoice" onClose={onClose} footer={<>{extra?.(inv)}<button className="btn secondary" onClick={() => window.print()}>Print</button></>}>
    {!inv ? <Loading /> : <div className="stack">
      <div className="row"><div><b>{school.school_name}</b><div className="small muted">{school.school_address}</div></div><div className="spacer" /><Badge>{inv.status}</Badge></div>
      <div className="form-grid small">
        <div><span className="muted">Invoice</span><br /><b>{inv.invoice_no}</b></div><div><span className="muted">Period</span><br /><b>{monthLabel(inv.period)}</b></div>
        <div><span className="muted">Student</span><br /><b>{inv.student_name}</b> ({inv.admission_no})</div><div><span className="muted">Class</span><br /><b>{inv.class}-{inv.section}</b></div>
        <div><span className="muted">Due date</span><br /><b>{fmtDate(inv.due_date)}</b></div>
      </div>
      <div className="table-wrap"><table><thead><tr><th>Fee head</th><th className="num">Amount</th></tr></thead><tbody>
        {inv.items.map((i, k) => <tr key={k}><td>{i.head}{i.frequency && <span className="small muted"> · {i.frequency}</span>}</td><td className="num">{inr(i.amount)}</td></tr>)}
        {inv.concession > 0 && <tr><td>Less: concession</td><td className="num">– {inr(inv.concession)}</td></tr>}
        {inv.late_fee > 0 && <tr><td>Late fee</td><td className="num">{inr(inv.late_fee)}</td></tr>}
        {inv.waived_fine > 0 && <tr><td className="muted small">(Late fee waived: {inr(inv.waived_fine)})</td><td /></tr>}
      </tbody><tfoot><tr><td>Total payable</td><td className="num">{inr(inv.payable)}</td></tr><tr><td>Paid</td><td className="num">{inr(inv.paid)}</td></tr><tr><td>Balance</td><td className="num">{inr(inv.balance)}</td></tr></tfoot></table></div>
      {!!inv.payments.length && <><h3>Payments</h3><div className="table-wrap"><table><tbody>{inv.payments.map(p => <tr key={p.id}><td>{p.receipt_no}</td><td>{fmtDate(p.paid_on)}</td><td>{p.mode}{p.reference ? ` · ${p.reference}` : ''}</td><td className="num">{inr(p.amount)}</td></tr>)}</tbody></table></div></>}
    </div>}
  </Modal>);
}

export function ReceiptView({ id, onClose }) {
  const { school } = useAuth();
  const [p] = useData(`/fees/payments/${id}/receipt`);
  return (<Modal title="Fee receipt" onClose={onClose} footer={<button className="btn" onClick={() => window.print()}>Print receipt</button>}>
    {!p ? <Loading /> : <div className="stack">
      <div style={{ textAlign: 'center' }}><h2 style={{ margin: 0 }}>{school.school_name}</h2><div className="small muted">{school.school_address}</div><div style={{ marginTop: 6 }}><Badge tone="ok">FEE RECEIPT</Badge></div></div>
      <div className="form-grid small">
        <div><span className="muted">Receipt No.</span><br /><b>{p.receipt_no}</b></div><div><span className="muted">Date</span><br /><b>{fmtDate(p.paid_on)}</b></div>
        <div><span className="muted">Student</span><br /><b>{p.student_name}</b></div><div><span className="muted">Admission No.</span><br /><b>{p.admission_no}</b></div>
        <div><span className="muted">Father's name</span><br /><b>{p.father_name}</b></div><div><span className="muted">Class</span><br /><b>{p.class}-{p.section}</b></div>
        <div><span className="muted">Against invoice</span><br /><b>{p.invoice_no} ({monthLabel(p.period)})</b></div><div><span className="muted">Mode</span><br /><b>{p.mode}{p.reference ? ` · ${p.reference}` : ''}</b></div>
      </div>
      <div className="card" style={{ textAlign: 'center' }}><div className="muted small">Amount received</div><div style={{ fontSize: 28, fontWeight: 700 }}>{inr(p.amount)}</div><div className="small">{inWords(p.amount)}</div></div>
      <div className="row small muted"><span>Received by: {p.received_by_name || '—'}</span><div className="spacer" /><span>This is a computer-generated receipt.</span></div>
    </div>}
  </Modal>);
}
