import { useState } from 'react';
import { post, put, del, qs } from '../api.js';
import { useData, Page, Modal, Field, Loading, ErrorBox, Badge, Stat, run, confirmDo, ClassPicker, useAuth, inr, fmtDate, monthLabel, todayISO, thisMonth } from '../ui.jsx';
import { InvoiceView, ReceiptView } from './FeeDocs.jsx';

const MODES = ['Cash', 'UPI', 'Cheque', 'Bank Transfer', 'Card', 'Online'];
const FREQ = ['Monthly', 'Quarterly', 'Half-Yearly', 'Annual', 'One-Time'];

function Overview() {
  const [s] = useData('/fees/summary');
  if (!s) return <Loading />;
  const pct = s.billed ? Math.round(s.collected / s.billed * 100) : 0;
  return (<div className="stack">
    <div className="grid-stats"><Stat label="Total billed" value={inr(s.billed)} icon="🧾" /><Stat label="Collected" value={inr(s.collected)} icon="✅" tone="ok" />
      <Stat label="Outstanding" value={inr(s.outstanding)} icon="⏳" tone="warn" /><Stat label="Overdue invoices" value={s.overdueCount} icon="⚠️" tone={s.overdueCount ? 'bad' : undefined} /><Stat label="Collected today" value={inr(s.todayCollection)} icon="📅" /></div>
    <div className="card"><div className="row"><b>Collection progress</b><div className="spacer" />{pct}%</div><div className="progress" style={{ marginTop: 8 }}><div style={{ width: `${pct}%` }} /></div></div>
    <div className="grid">
      <div className="card flush"><div className="card-head"><b>Class-wise</b></div><div className="table-wrap"><table><thead><tr><th>Class</th><th className="num">Billed</th><th className="num">Collected</th><th className="num">Due</th></tr></thead>
        <tbody>{s.byClass.map(c => <tr key={c.class}><td>{c.class}</td><td className="num">{inr(c.billed)}</td><td className="num">{inr(c.collected)}</td><td className="num">{inr(c.outstanding)}</td></tr>)}</tbody></table></div></div>
      <div className="card flush"><div className="card-head"><b>By payment mode</b></div><div className="table-wrap"><table><tbody>{s.byMode.map(m => <tr key={m.mode}><td>{m.mode}</td><td className="num">{m.count} payments</td><td className="num">{inr(m.amount)}</td></tr>)}</tbody></table>{!s.byMode.length && <div className="empty">No payments yet.</div>}</div></div>
    </div>
  </div>);
}

function Invoices() {
  const [f, setF] = useState({ status: 'Unpaid' });
  const [rows, reload, { error }] = useData('/fees/invoices' + qs(f));
  const [pay, setPay] = useState(null);
  const [view, setView] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const collect = async (e) => {
    e.preventDefault();
    const r = await run(() => post('/fees/payments', pay), (r) => `Payment recorded – ${r.receipt_no}`);
    if (r) { setPay(null); reload(); setReceipt(r.id); }
  };
  const total = (k) => inr((rows || []).reduce((a, r) => a + r[k], 0));
  return (<div className="stack">
    <div className="filters"><ClassPicker value={f} onChange={setF} allowAll /><input type="month" value={f.period || ''} onChange={(e) => setF({ ...f, period: e.target.value })} />
      <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="">All</option><option value="Unpaid">Unpaid (any balance)</option><option>Overdue</option><option>Partially Paid</option><option>Paid</option></select>
      <input placeholder="Student / admission / invoice no." value={f.q || ''} onChange={(e) => setF({ ...f, q: e.target.value })} /></div>
    <ErrorBox error={error} />
    {!rows ? <Loading /> : <div className="card flush"><div className="table-wrap"><table>
      <thead><tr><th>Invoice</th><th>Student</th><th>Period</th><th className="num">Payable</th><th className="num">Paid</th><th className="num">Balance</th><th>Status</th><th /></tr></thead>
      <tbody>{rows.map(r => <tr key={r.id}><td className="nowrap"><a href="#" onClick={(e) => { e.preventDefault(); setView(r.id); }}>{r.invoice_no}</a><div className="small muted">Due {fmtDate(r.due_date)}</div></td>
        <td><b>{r.student_name}</b><div className="small muted">{r.admission_no} · {r.class}-{r.section}</div></td><td className="nowrap">{monthLabel(r.period)}</td>
        <td className="num">{inr(r.payable)}{r.late_fee > 0 && <div className="small muted">incl. fine {inr(r.late_fee)}</div>}</td><td className="num">{inr(r.paid)}</td><td className="num"><b>{inr(r.balance)}</b></td>
        <td><Badge>{r.status}</Badge></td>
        <td className="right">{r.balance > 0 && <button className="btn sm ok" onClick={() => setPay({ invoice_id: r.id, amount: r.balance, mode: 'Cash', paid_on: todayISO(), _r: r })}>Collect</button>}</td></tr>)}</tbody>
      {!!rows.length && <tfoot><tr><td colSpan={3}>{rows.length} invoices</td><td className="num">{total('payable')}</td><td className="num">{total('paid')}</td><td className="num">{total('balance')}</td><td colSpan={2} /></tr></tfoot>}
    </table>{!rows.length && <div className="empty">No invoices match.</div>}</div></div>}
    {pay && <Modal title={`Collect fee – ${pay._r.student_name}`} onClose={() => setPay(null)} footer={<><button className="btn secondary" onClick={() => setPay(null)}>Cancel</button><button className="btn ok" form="payf">Record payment</button></>}>
      <div className="alert info" style={{ marginBottom: 12 }}>{pay._r.invoice_no} · {monthLabel(pay._r.period)} · Balance <b>{inr(pay._r.balance)}</b></div>
      <form id="payf" className="form-grid" onSubmit={collect}>
        {[{ name: 'amount', label: 'Amount (₹)', type: 'number', step: '0.01', min: 1, required: true }, { name: 'mode', label: 'Payment mode', type: 'select', options: MODES, noBlank: true },
          { name: 'reference', label: 'UTR / Cheque no. / Txn ID' }, { name: 'paid_on', label: 'Date', type: 'date' }].map(x => <Field key={x.name} f={x} value={pay[x.name]} onChange={(k, v) => setPay({ ...pay, [k]: v })} />)}
      </form></Modal>}
    {view && <InvoiceView id={view} onClose={() => setView(null)} extra={(inv) => inv && <>
      {inv.late_fee > 0 && <button className="btn secondary" onClick={async () => { if (await run(() => put(`/fees/invoices/${inv.id}/waive-fine`, { amount: inv.late_fee + inv.waived_fine }), 'Late fee waived')) { setView(null); reload(); } }}>Waive late fee</button>}
      {!inv.payments.length && <button className="btn danger" onClick={async () => { if (confirmDo('Delete this invoice?') && await run(() => del(`/fees/invoices/${inv.id}`), 'Invoice deleted')) { setView(null); reload(); } }}>Delete</button>}
      {inv.payments.map(p => <button key={p.id} className="btn secondary" onClick={() => setReceipt(p.id)}>Receipt {p.receipt_no.slice(-6)}</button>)}</>} />}
    {receipt && <ReceiptView id={receipt} onClose={() => setReceipt(null)} />}
  </div>);
}

function Generate() {
  const d = new Date(); const due = new Date(d.getFullYear(), d.getMonth(), 10);
  const [f, setF] = useState({ period: thisMonth(), due_date: due.toISOString().slice(0, 10), class: '', section: '' });
  const [res, setRes] = useState(null);
  const [students] = useData('/students' + qs({ q: f.q }));
  const [one, setOne] = useState({ items: [{ head: '', amount: '' }] });
  return (<div className="grid">
    <form className="card stack" onSubmit={async (e) => { e.preventDefault(); const r = await run(() => post('/fees/generate', f)); if (r) setRes(r); }}>
      <h2>Generate monthly invoices</h2>
      <div className="small muted">Creates invoices from the fee structure. Monthly heads are billed every month; quarterly in Apr/Jul/Oct/Jan; half-yearly in Apr/Oct; annual in April. Transport fee is billed only to students with a bus route; concessions are applied automatically. Students already billed for the month are skipped.</div>
      <div className="form-grid">
        <label className="f">Billing month<input type="month" value={f.period} onChange={(e) => setF({ ...f, period: e.target.value })} required /></label>
        <label className="f">Due date<input type="date" value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} required /></label>
        <ClassPicker value={f} onChange={setF} allowAll />
      </div>
      <label className="row small"><input type="checkbox" checked={!!f.include_one_time} onChange={(e) => setF({ ...f, include_one_time: e.target.checked })} /> Include one-time fees (e.g. admission fee)</label>
      {res && <div className="alert ok">Created {res.created} invoices · skipped {res.skipped} (already billed){res.noStructure ? ` · ${res.noStructure} students had no fee structure` : ''}</div>}
      <div><button className="btn">Generate invoices</button></div>
    </form>
    <form className="card stack" onSubmit={async (e) => { e.preventDefault(); if (await run(() => post('/fees/invoices', one), 'Invoice created')) setOne({ items: [{ head: '', amount: '' }] }); }}>
      <h2>Custom invoice for one student</h2>
      <label className="f">Student<select value={one.student_id || ''} onChange={(e) => setOne({ ...one, student_id: e.target.value })} required><option value="">— Select —</option>
        {(students || []).map(s => <option key={s.id} value={s.id}>{s.name} ({s.admission_no}) – {s.class}-{s.section}</option>)}</select></label>
      <div className="form-grid">
        <label className="f">Period label<input value={one.period || ''} placeholder="e.g. 2026-11-TRIP" onChange={(e) => setOne({ ...one, period: e.target.value })} required /></label>
        <label className="f">Due date<input type="date" value={one.due_date || ''} onChange={(e) => setOne({ ...one, due_date: e.target.value })} required /></label></div>
      {one.items.map((it, i) => <div key={i} className="row"><input style={{ flex: 2 }} placeholder="Fee head e.g. Educational trip" value={it.head} onChange={(e) => { const items = [...one.items]; items[i] = { ...it, head: e.target.value }; setOne({ ...one, items }); }} required />
        <input style={{ flex: 1 }} type="number" placeholder="₹" value={it.amount} onChange={(e) => { const items = [...one.items]; items[i] = { ...it, amount: e.target.value }; setOne({ ...one, items }); }} required /></div>)}
      <div className="row"><button type="button" className="btn sm secondary" onClick={() => setOne({ ...one, items: [...one.items, { head: '', amount: '' }] })}>＋ Item</button><div className="spacer" /><button className="btn">Create invoice</button></div>
    </form>
  </div>);
}

function Structure() {
  const { structure } = useAuth();
  const CLASSES = structure.classes.map(c => c.name);
  const [cls, setCls] = useState('');
  const [rows, reload] = useData('/fees/structures' + qs({ class: cls }));
  const [edit, setEdit] = useState(null);
  const save = async (e) => { e.preventDefault(); if (await run(() => edit.id ? put(`/fees/structures/${edit.id}`, edit) : post('/fees/structures', edit), 'Saved')) { setEdit(null); reload(); } };
  const byClass = {}; (rows || []).forEach(r => (byClass[r.class] ||= []).push(r));
  return (<div className="stack">
    <div className="row"><select style={{ width: 'auto' }} value={cls} onChange={(e) => setCls(e.target.value)}><option value="">All classes</option>{CLASSES.map(c => <option key={c}>{c}</option>)}</select><div className="spacer" />
      <button className="btn" onClick={() => setEdit({ class: cls, frequency: 'Monthly' })}>＋ Add fee head</button></div>
    {!rows ? <Loading /> : !rows.length ? <div className="card empty">No fee structure yet. Add fee heads like Tuition Fee, Transport Fee, Annual Charges for each class.</div> :
      <div className="grid">{Object.entries(byClass).map(([c, items]) => <div key={c} className="card flush"><div className="card-head"><b>Class {c}</b><div className="spacer" /><span className="small muted">Monthly: {inr(items.filter(i => i.frequency === 'Monthly').reduce((a, i) => a + i.amount, 0))}</span></div>
        <table><tbody>{items.map(i => <tr key={i.id}><td>{i.fee_head}<div className="small muted">{i.frequency}</div></td><td className="num">{inr(i.amount)}</td>
          <td className="right nowrap"><button className="btn sm ghost" onClick={() => setEdit(i)}>✎</button><button className="btn sm ghost" onClick={async () => { if (confirmDo('Delete fee head?') && await run(() => del(`/fees/structures/${i.id}`))) reload(); }}>🗑</button></td></tr>)}</tbody></table></div>)}</div>}
    {edit && <Modal title={edit.id ? 'Edit fee head' : 'Add fee head'} onClose={() => setEdit(null)} footer={<button className="btn" form="fsf">Save</button>}>
      <form id="fsf" className="form-grid" onSubmit={save}>{[{ name: 'class', label: 'Class', type: 'select', options: CLASSES, required: true },
        { name: 'fee_head', label: 'Fee head', required: true, placeholder: 'Tuition Fee' }, { name: 'amount', label: 'Amount (₹) per instalment', type: 'number', required: true, min: 0 },
        { name: 'frequency', label: 'Frequency', type: 'select', options: FREQ, noBlank: true }].map(x => <Field key={x.name} f={x} value={edit[x.name]} onChange={(k, v) => setEdit({ ...edit, [k]: v })} />)}</form>
      <div className="small muted" style={{ marginTop: 10 }}>Fee heads containing the word "Transport" are billed only to students who use a school bus, and are excluded from concessions.</div>
    </Modal>}
  </div>);
}

function Payments() {
  const [f, setF] = useState({ from: todayISO().slice(0, 8) + '01', to: todayISO() });
  const [rows] = useData('/fees/payments' + qs(f));
  const [receipt, setReceipt] = useState(null);
  return (<div className="stack">
    <div className="filters"><label className="f">From<input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></label><label className="f">To<input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></label></div>
    {!rows ? <Loading /> : <div className="card flush"><div className="table-wrap"><table>
      <thead><tr><th>Receipt</th><th>Date</th><th>Student</th><th>Invoice</th><th>Mode</th><th className="num">Amount</th></tr></thead>
      <tbody>{rows.map(p => <tr key={p.id}><td><a href="#" onClick={(e) => { e.preventDefault(); setReceipt(p.id); }}>{p.receipt_no}</a></td><td className="nowrap">{fmtDate(p.paid_on)}</td>
        <td>{p.student_name}<div className="small muted">{p.admission_no} · {p.class}-{p.section}</div></td><td className="small">{p.invoice_no}</td><td>{p.mode}<div className="small muted">{p.reference}</div></td><td className="num">{inr(p.amount)}</td></tr>)}</tbody>
      {!!rows.length && <tfoot><tr><td colSpan={5}>{rows.length} receipts</td><td className="num">{inr(rows.reduce((a, r) => a + r.amount, 0))}</td></tr></tfoot>}</table>
      {!rows.length && <div className="empty">No payments in this period.</div>}</div></div>}
    {receipt && <ReceiptView id={receipt} onClose={() => setReceipt(null)} />}
  </div>);
}

const TABS = [['Overview', Overview], ['Invoices & Collection', Invoices], ['Generate Invoices', Generate], ['Fee Structure', Structure], ['Payments Register', Payments]];
export default function Fees() {
  const [tab, setTab] = useState(0);
  const Comp = TABS[tab][1];
  return (<Page title="Fees Management" sub="Fee structure, invoicing, late fees, collection and receipts">
    <div className="tabs">{TABS.map(([l], i) => <button key={l} className={tab === i ? 'on' : ''} onClick={() => setTab(i)}>{l}</button>)}</div>
    <Comp />
  </Page>);
}
