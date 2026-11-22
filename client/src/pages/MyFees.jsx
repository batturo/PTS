import { useState } from 'react';
import { useAuth, useData, Page, Loading, ErrorBox, Badge, Stat, inr, fmtDate, monthLabel } from '../ui.jsx';
import { InvoiceView, ReceiptView } from './FeeDocs.jsx';

export default function MyFees() {
  const { student } = useAuth();
  const [d, , { error }] = useData('/fees/my');
  const [view, setView] = useState(null); const [receipt, setReceipt] = useState(null);
  if (error) return <ErrorBox error={error} />;
  if (!d) return <Loading />;
  return (<Page title="Fees" sub={`${student.name} · Admission No. ${student.admission_no}`}>
    <div className="grid-stats"><Stat label="Total payable" value={inr(d.totals.payable)} icon="🧾" /><Stat label="Paid" value={inr(d.totals.paid)} icon="✅" tone="ok" />
      <Stat label="Balance due" value={inr(d.totals.balance)} icon="⏳" tone={d.totals.balance > 0 ? 'warn' : 'ok'} /></div>
    {d.invoices.some(i => i.status === 'Overdue') && <div className="alert">Some fees are overdue and a late fee is being added. Please pay at the school accounts office.</div>}
    <div className="card flush"><div className="card-head"><b>Invoices</b></div><div className="table-wrap"><table>
      <thead><tr><th>Period</th><th>Due date</th><th className="num">Payable</th><th className="num">Paid</th><th className="num">Balance</th><th>Status</th></tr></thead>
      <tbody>{d.invoices.map(i => <tr key={i.id} onClick={() => setView(i.id)} style={{ cursor: 'pointer' }}><td><a href="#" onClick={(e) => e.preventDefault()}>{monthLabel(i.period)}</a><div className="small muted">{i.items.map(x => x.head).join(', ')}</div></td>
        <td className="nowrap">{fmtDate(i.due_date)}</td><td className="num">{inr(i.payable)}{i.late_fee > 0 && <div className="small muted">incl. late fee {inr(i.late_fee)}</div>}</td><td className="num">{inr(i.paid)}</td><td className="num"><b>{inr(i.balance)}</b></td><td><Badge>{i.status}</Badge></td></tr>)}</tbody></table>
      {!d.invoices.length && <div className="empty">No fee invoices yet.</div>}</div></div>
    <div className="card flush"><div className="card-head"><b>Payment receipts</b></div><div className="table-wrap"><table>
      <tbody>{d.receipts.map(r => <tr key={r.id}><td><a href="#" onClick={(e) => { e.preventDefault(); setReceipt(r.id); }}>{r.receipt_no}</a></td><td>{fmtDate(r.paid_on)}</td><td>{r.mode}</td><td className="num">{inr(r.amount)}</td></tr>)}</tbody></table>
      {!d.receipts.length && <div className="empty">No payments yet.</div>}</div></div>
    {view && <InvoiceView id={view} onClose={() => setView(null)} />}{receipt && <ReceiptView id={receipt} onClose={() => setReceipt(null)} />}
  </Page>);
}
