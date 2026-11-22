// Accountant's fee desk: Fee Entry (search → collect), Current Fees Status (class-wise, whole year), Fee Defaulters.
import { useEffect, useMemo, useRef, useState } from 'react';
import { get, post, qs } from '../api.js';
import { useData, Loading, ErrorBox, Badge, Stat, run, ClassPicker, inr, fmtDate, todayISO } from '../ui.jsx';
import { ReceiptView } from './FeeDocs.jsx';

export const MODES = ['Cash', 'UPI', 'Cheque', 'Bank Transfer', 'Card', 'Online'];
const curAy = () => { const t = todayISO(); const y = +t.slice(0, 4), m = +t.slice(5, 7); return m >= 4 ? y : y - 1; };
const ayLabel = (y) => `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
const short = (p) => new Date(`${p}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
const long = (p) => new Date(`${p}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
const thisMonth = () => todayISO().slice(0, 7);
const STATUS_TONE = { Paid: 'ok', 'Partially Paid': 'warn', Overdue: 'bad', Due: 'warn', 'Not billed': 'bad', Upcoming: '', 'No fee': '' };

function YearSelect({ value, onChange, years }) {
  const list = [...new Set([...(years || []), curAy(), curAy() - 1, curAy() - 2])].sort((a, b) => b - a);
  return (<select value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label="Academic year" style={{ maxWidth: 170 }}>
    {list.map(y => <option key={y} value={y}>Session {ayLabel(y)}</option>)}</select>);
}
function downloadCsv(name, rows) {
  const csv = rows.map(r => r.map(x => `"${String(x ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' })); a.download = name; a.click();
}

// ---------------------------------------------------------------- Fee Entry
export function FeeEntry({ studentId, onStudent }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const [ay, setAy] = useState(curAy());
  const [led, reload, { error }] = useData(studentId ? `/fees/student/${studentId}/ledger?ay=${ay}` : null, [studentId, ay]);
  const [sel, setSel] = useState(new Set());
  const [pay, setPay] = useState({ mode: 'Cash', reference: '', paid_on: todayISO(), amount: '' });
  const [amountEdited, setAmountEdited] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [busy, setBusy] = useState(false);
  const searchRef = useRef(null);

  useEffect(() => { // search as you type
    if (q.trim().length < 2) { setResults(null); return; }
    const t = setTimeout(() => get('/fees/search' + qs({ q: q.trim() })).then(setResults).catch(() => setResults([])), 250);
    return () => clearTimeout(t);
  }, [q]);

  // everything payable in this view, keyed m:<period> for months and i:<invoice id> for other dues
  const payables = useMemo(() => {
    if (!led) return [];
    const months = led.months.filter(m => m.balance > 0.001 && m.status !== 'No fee')
      .map(m => ({ key: `m:${m.period}`, label: long(m.period), balance: m.balance, period: m.period, invoice_id: m.invoice_id, billed: m.billed }));
    const dues = [...led.pastDues, ...led.otherDues].map(i => ({ key: `i:${i.id}`, label: `${i.invoice_no} (${i.period})`, balance: i.balance, invoice_id: i.id, billed: true, past: true }));
    return [...dues, ...months];
  }, [led]);
  useEffect(() => { // pre-select everything due till this month, plus earlier dues
    if (!led) return;
    setSel(new Set(payables.filter(p => p.past || p.period <= thisMonth()).map(p => p.key)));
    setAmountEdited(false);
  }, [led]); // eslint-disable-line react-hooks/exhaustive-deps
  const selected = payables.filter(p => sel.has(p.key));
  const selTotal = Math.round(selected.reduce((a, p) => a + p.balance, 0) * 100) / 100;
  useEffect(() => { if (!amountEdited) setPay(p => ({ ...p, amount: selTotal || '' })); }, [selTotal, amountEdited]);
  const toggle = (key) => setSel(s => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });

  const choose = (s) => { onStudent(s.id); setQ(''); setResults(null); };
  const collect = async (e) => {
    e.preventDefault();
    if (!selected.length) return run(() => Promise.reject(new Error('Tick at least one month or due to collect')));
    setBusy(true);
    const r = await run(() => post('/fees/collect', {
      student_id: studentId, amount: Number(pay.amount), mode: pay.mode, reference: pay.reference, paid_on: pay.paid_on,
      months: selected.filter(p => p.period && !p.billed).map(p => p.period),
      invoice_ids: selected.filter(p => p.billed).map(p => p.invoice_id),
    }), (r) => `Fee collected – receipt ${r.receipt_no}`);
    setBusy(false);
    if (r) { setReceipt(r.id); setPay(p => ({ ...p, reference: '' })); reload(); }
  };

  return (<div className="stack">
    <div className="card" style={{ position: 'relative' }}>
      <label className="f">Search student by name, admission no., father's name or mobile
        <input ref={searchRef} autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Start typing, e.g. Aarav or 2026001" aria-label="Search student" /></label>
      {results && <div className="card flush" style={{ position: 'absolute', left: 16, right: 16, zIndex: 10, marginTop: 4, maxHeight: 360, overflowY: 'auto' }}>
        {!results.length ? <div className="empty">No student found for “{q}”.</div> : results.map(s => (
          <button key={s.id} type="button" className="row" onClick={() => choose(s)}
            style={{ width: '100%', border: 0, borderBottom: '1px solid var(--border)', background: 'var(--surface)', padding: '10px 14px', cursor: 'pointer', textAlign: 'left', font: 'inherit', color: 'inherit' }}>
            <div className="avatar">{s.name[0]}</div>
            <div style={{ flex: 1 }}><b>{s.name}</b>{!s.active && <> <Badge tone="bad">Left</Badge></>}
              <div className="small muted">Adm. {s.admission_no} · Class {s.class}-{s.section} · {s.father_name || '—'}{s.mobile ? ` · ${s.mobile}` : ''}</div></div>
            {s.outstanding > 0 ? <Badge tone="bad">{`${inr(s.outstanding)} due`}</Badge> : <Badge tone="ok">No dues</Badge>}
          </button>))}
      </div>}
    </div>

    {!studentId ? <div className="card empty">Search for a student to see their fees and collect a payment.</div> : error ? <ErrorBox error={error} /> : !led ? <Loading /> : <>
      <div className="card row">
        <div className="avatar" style={{ width: 46, height: 46, fontSize: 20 }}>{led.student.name[0]}</div>
        <div style={{ flex: 1, minWidth: 200 }}><h2 style={{ margin: 0 }}>{led.student.name}</h2>
          <div className="small muted">Adm. {led.student.admission_no} · Class {led.student.class}-{led.student.section}{led.student.roll_no ? ` · Roll ${led.student.roll_no}` : ''}
            {' · '}Father: {led.student.father_name || '—'}{led.student.mobile ? <> · <a href={`tel:${led.student.mobile}`}>{led.student.mobile}</a></> : ''}
            {led.student.concession_pct > 0 && <> · Concession {led.student.concession_pct}%</>}{led.student.route_no && <> · Bus {led.student.route_no}</>}</div></div>
        <YearSelect value={ay} onChange={setAy} />
      </div>
      <div className="grid-stats">
        <Stat label={`Fee for session ${led.ay_label}`} value={inr(led.totals.expected)} icon="🧾" />
        <Stat label="Paid this session" value={inr(led.totals.collected)} icon="✅" tone="ok" />
        <Stat label="Due till this month" value={inr(led.totals.due + led.totals.notBilledTillDate)} icon="⏳" tone={led.totals.due + led.totals.notBilledTillDate > 0 ? 'bad' : 'ok'} />
        <Stat label="Previous years' dues" value={inr(led.totals.pastDues)} icon="📁" tone={led.totals.pastDues > 0 ? 'bad' : undefined} />
      </div>

      {(led.pastDues.length > 0 || led.otherDues.length > 0) && <div className="card flush"><div className="card-head"><b>Other dues</b><span className="small muted">Previous years and extra charges</span></div>
        <table><tbody>{[...led.pastDues, ...led.otherDues].map(i => <tr key={i.id} onClick={() => toggle(`i:${i.id}`)} style={{ cursor: 'pointer' }}>
          <td style={{ width: 30 }}><input type="checkbox" checked={sel.has(`i:${i.id}`)} readOnly aria-label={`Pay ${i.invoice_no}`} /></td>
          <td><b>{i.invoice_no}</b><div className="small muted">{i.period} · {i.items.map(x => x.head).join(', ')}</div></td>
          <td><Badge tone={STATUS_TONE[i.status]}>{i.status}</Badge></td><td className="num"><b>{inr(i.balance)}</b></td></tr>)}</tbody></table></div>}

      <div className="card">
        <div className="row" style={{ marginBottom: 10 }}><h2 style={{ margin: 0 }}>Session {led.ay_label}: month-wise fees</h2><div className="spacer" />
          <span className="small muted">Tick the months to collect. Months not billed yet are billed from the fee structure when paid.</span></div>
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 150px), 1fr))' }}>
          {led.months.map(m => {
            const payable = m.balance > 0.001 && m.status !== 'No fee', on = sel.has(`m:${m.period}`);
            return (<button key={m.period} type="button" disabled={!payable} onClick={() => toggle(`m:${m.period}`)} aria-pressed={on}
              title={m.items.map(i => `${i.head}: ₹${i.amount}`).join('\n')}
              style={{ textAlign: 'left', font: 'inherit', color: 'inherit', cursor: payable ? 'pointer' : 'default', padding: 12, borderRadius: 10,
                background: on ? 'var(--primary-soft)' : 'var(--surface)', border: `2px solid ${on ? 'var(--primary-2)' : 'var(--border)'}`, opacity: m.status === 'No fee' ? 0.6 : 1 }}>
              <div className="row" style={{ gap: 6 }}><b>{short(m.period)}</b><div className="spacer" />{payable && <input type="checkbox" checked={on} readOnly tabIndex={-1} aria-hidden="true" />}</div>
              <div style={{ fontSize: 17, fontWeight: 700, margin: '4px 0' }}>{inr(m.amount)}</div>
              <Badge tone={STATUS_TONE[m.status]}>{m.status}</Badge>
              {m.paid > 0 && m.balance > 0 && <div className="small muted" style={{ marginTop: 4 }}>Paid {inr(m.paid)} · Bal {inr(m.balance)}</div>}
              {m.late_fee > 0 && <div className="small muted">incl. late fee {inr(m.late_fee)}</div>}
            </button>);
          })}
        </div>
      </div>

      <form className="card stack" onSubmit={collect}>
        <div className="row"><h2 style={{ margin: 0 }}>Collect fee</h2><div className="spacer" />
          <span className="small">{selected.length ? `${selected.length} selected: ${selected.map(p => p.period ? short(p.period) : p.label).join(', ')}` : 'Nothing selected'}</span></div>
        <div className="form-grid">
          <label className="f">Amount (₹) *<input type="number" min="1" step="0.01" max={selTotal || undefined} value={pay.amount} required
            onChange={(e) => { setAmountEdited(true); setPay({ ...pay, amount: e.target.value }); }} />
            <span className="small" style={{ fontWeight: 400 }}>Selected dues: {inr(selTotal)}{Number(pay.amount) < selTotal && pay.amount !== '' ? ' · part payment (oldest month first)' : ''}</span></label>
          <label className="f">Payment mode<select value={pay.mode} onChange={(e) => setPay({ ...pay, mode: e.target.value })}>{MODES.map(m => <option key={m}>{m}</option>)}</select></label>
          <label className="f">UTR / cheque no. / txn ID<input value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} required={['Cheque', 'UPI', 'Bank Transfer'].includes(pay.mode)} /></label>
          <label className="f">Date<input type="date" max={todayISO()} value={pay.paid_on} onChange={(e) => setPay({ ...pay, paid_on: e.target.value })} required /></label>
        </div>
        <div className="row"><div className="spacer" /><button className="btn ok" disabled={busy || !selected.length}>{busy ? 'Saving…' : `Collect ${inr(Number(pay.amount) || 0)} & print receipt`}</button></div>
      </form>

      {!!led.receipts.length && <div className="card flush"><div className="card-head"><b>Recent receipts</b></div><div className="table-wrap"><table><tbody>
        {led.receipts.map(r => <tr key={r.id}><td><a href="#" onClick={(e) => { e.preventDefault(); setReceipt(r.id); }}>{r.receipt_no}</a></td><td>{fmtDate(r.paid_on)}</td><td>{r.mode}{r.reference ? ` · ${r.reference}` : ''}</td><td className="num">{inr(r.amount)}</td></tr>)}
      </tbody></table></div></div>}
    </>}
    {receipt && <ReceiptView id={receipt} onClose={() => { setReceipt(null); searchRef.current?.focus(); }} />}
  </div>);
}

// ---------------------------------------------------------------- Current Fees Status
export function FeesStatus() {
  const [ay, setAy] = useState(curAy());
  const [d, , { error }] = useData(`/fees/status?ay=${ay}`, [ay]);
  const [open, setOpen] = useState({});
  if (error) return <ErrorBox error={error} />;
  if (!d) return <Loading />;
  const calc = (r) => {
    const tillDate = r.due + r.notBilledTillDate, balanceYear = r.expected - r.collected;
    const outstanding = tillDate + r.pastDues;
    return { ...r, tillDate, restOfYear: Math.max(0, balanceYear - tillDate), outstanding, pct: r.collected + outstanding > 0 ? Math.round(r.collected / (r.collected + outstanding) * 100) : 100 };
  };
  const t = calc(d.total);
  const csv = () => downloadCsv(`fees-status-${d.ay_label}.csv`, [['Class', 'Section', 'Students', 'Fee for session', 'Collected', 'Due till date', 'Rest of session', 'Previous years dues', 'Total outstanding', 'Collection %'],
    ...d.classes.flatMap(c => [c, ...c.sections.map(s => ({ ...s, class: c.class }))].map(calc).map(r => [r.class, r.section || 'All', r.students, r.expected, r.collected, r.tillDate, r.restOfYear, r.pastDues, r.outstanding, r.pct])),
    ['Total', '', t.students, t.expected, t.collected, t.tillDate, t.restOfYear, t.pastDues, t.outstanding, t.pct]]);
  const Row = ({ r, sub }) => (<tr style={sub ? { background: 'var(--surface-2)' } : null}>
    <td className="nowrap">{sub ? <span style={{ paddingLeft: 22 }}>Section {r.section}</span> :
      <button className="btn ghost sm" style={{ padding: '0 6px 0 0', minHeight: 0 }} onClick={() => setOpen({ ...open, [r.class]: !open[r.class] })} aria-expanded={!!open[r.class]}>{open[r.class] ? '▾' : '▸'} <b>Class {r.class}</b></button>}</td>
    <td className="num">{r.students}</td><td className="num">{inr(r.expected)}</td><td className="num" style={{ color: 'var(--ok)' }}>{inr(r.collected)}</td>
    <td className="num" style={{ color: r.tillDate > 0 ? 'var(--bad)' : undefined }}><b>{inr(r.tillDate)}</b></td><td className="num">{inr(r.restOfYear)}</td>
    <td className="num" style={{ color: r.pastDues > 0 ? 'var(--bad)' : undefined }}>{inr(r.pastDues)}</td><td className="num"><b>{inr(r.outstanding)}</b></td>
    <td className="num"><div className="row" style={{ gap: 6, justifyContent: 'flex-end', flexWrap: 'nowrap' }}><div className="progress" style={{ width: 60 }}><div style={{ width: `${r.pct}%` }} /></div>{r.pct}%</div></td>
    <td className="num">{r.defaulters}</td></tr>);
  return (<div className="stack">
    <div className="row no-print"><YearSelect value={ay} onChange={setAy} years={d.years} /><div className="spacer" />
      <button className="btn secondary sm" onClick={csv}>⬇ Download CSV</button><button className="btn secondary sm" onClick={() => window.print()}>🖨 Print</button></div>
    <div className="grid-stats">
      <Stat label={`Fee for session ${d.ay_label}`} value={inr(t.expected)} icon="🧾" />
      <Stat label={`Collected (${t.pct}%)`} value={inr(t.collected)} icon="✅" tone="ok" />
      <Stat label="Due till this month" value={inr(t.tillDate)} icon="⏳" tone={t.tillDate > 0 ? 'bad' : undefined} />
      <Stat label="Rest of the session" value={inr(t.restOfYear)} icon="📅" />
      <Stat label="Previous years' dues" value={inr(t.pastDues)} icon="📁" tone={t.pastDues > 0 ? 'bad' : undefined} />
      <Stat label="Students with dues" value={`${t.defaulters} / ${t.students}`} icon="👥" />
    </div>
    <div className="card flush"><div className="card-head"><b>Class-wise fee status · session {d.ay_label}</b><span className="small muted">Click a class to see its sections</span></div>
      <div className="table-wrap"><table>
        <thead><tr><th>Class</th><th className="num">Students</th><th className="num">Fee for session</th><th className="num">Collected</th><th className="num">Due till date</th>
          <th className="num">Rest of session</th><th className="num">Previous years</th><th className="num">Total outstanding</th><th className="num">Collected %</th><th className="num">With dues</th></tr></thead>
        <tbody>{d.classes.map(c => [<Row key={c.class} r={calc(c)} />, ...(open[c.class] ? c.sections.map(s => <Row key={c.class + s.section} r={calc(s)} sub />) : [])])}</tbody>
        <tfoot><tr><td>Whole school</td><td className="num">{t.students}</td><td className="num">{inr(t.expected)}</td><td className="num">{inr(t.collected)}</td><td className="num">{inr(t.tillDate)}</td>
          <td className="num">{inr(t.restOfYear)}</td><td className="num">{inr(t.pastDues)}</td><td className="num">{inr(t.outstanding)}</td><td className="num">{t.pct}%</td><td className="num">{t.defaulters}</td></tr></tfoot>
      </table>{!d.classes.length && <div className="empty">No students yet.</div>}</div></div>
    <div className="small muted">
      <b>Fee for session</b> is everything billed this session, plus what the fee structure will bill for the remaining months.
      <b> Due till date</b> is unpaid fees up to this month, including months not billed yet.
      <b> Previous years</b> is unpaid fees from earlier sessions.
    </div>
    <div className="grid">
      <div className="card"><div className="small muted">Collected today</div><div style={{ fontSize: 22, fontWeight: 700 }}>{inr(d.todayCollection)}</div></div>
      <div className="card flush"><div className="card-head"><b>By payment mode (this session)</b></div><table><tbody>{d.byMode.map(m => <tr key={m.mode}><td>{m.mode}</td><td className="num">{m.count} receipts</td><td className="num">{inr(m.amount)}</td></tr>)}</tbody></table>
        {!d.byMode.length && <div className="empty">No payments yet.</div>}</div>
    </div>
  </div>);
}

// ---------------------------------------------------------------- Defaulters
export function Defaulters({ onCollect }) {
  const [f, setF] = useState({ ay: curAy(), class: '', section: '', mode: 'any', month: thisMonth(), min_months: 2, upto: thisMonth(), unbilled: true });
  const params = { ay: f.ay, class: f.class, section: f.section, upto: f.upto, unbilled: f.unbilled ? '' : '0',
    ...(f.mode === 'month' ? { month: f.month } : f.mode === 'count' ? { min_months: f.min_months } : {}) };
  const [d, , { error, loading }] = useData('/fees/defaulters' + qs(params));
  const [sel, setSel] = useState(new Set());
  useEffect(() => setSel(new Set()), [d]);
  const months = useMemo(() => [...Array(12)].map((_, i) => { const m = ((i + 3) % 12) + 1; return `${m >= 4 ? f.ay : f.ay + 1}-${String(m).padStart(2, '0')}`; }), [f.ay]);
  const setAy = (ay) => { const ms = [...Array(12)].map((_, i) => { const m = ((i + 3) % 12) + 1; return `${m >= 4 ? ay : ay + 1}-${String(m).padStart(2, '0')}`; });
    const pick = (v) => (ms.includes(v) ? v : (thisMonth() > ms[11] ? ms[11] : ms[0])); setF({ ...f, ay, month: pick(f.month), upto: pick(f.upto) }); };
  const rows = d?.rows || [];
  const remind = async () => { if (await run(() => post('/fees/reminders', { student_ids: [...sel], filters: params }), (r) => `Fee reminder sent to ${r.sent} student(s)/parent(s) – it appears in their Notices`)) setSel(new Set()); };
  const csv = () => downloadCsv(`fee-defaulters-${d.ay_label}.csv`, [['Adm. No.', 'Student', 'Father', 'Mobile', 'Class', 'Section', 'Unpaid months', 'Months due (₹)', 'Previous years (₹)', 'Other dues (₹)', 'Total due (₹)', 'Last paid'],
    ...rows.map(r => [r.admission_no, r.name, r.father_name, r.mobile, r.class, r.section, r.unpaid_months.map(m => short(m.period)).join(' '), r.month_due, r.past_due, r.other_due, r.total_due, r.last_paid_on || ''])]);
  return (<div className="stack">
    <div className="card stack no-print">
      <div className="filters">
        <YearSelect value={f.ay} onChange={setAy} />
        <ClassPicker value={f} onChange={(v) => setF({ ...f, ...v })} allowAll />
        <select value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })} aria-label="Show students who">
          <option value="any">Any dues</option><option value="month">Unpaid for a month</option><option value="count">Unpaid N+ months</option></select>
        {f.mode === 'month' && <select value={f.month} onChange={(e) => setF({ ...f, month: e.target.value })} aria-label="Month">{months.map(m => <option key={m} value={m}>{long(m)}</option>)}</select>}
        {f.mode === 'count' && <label className="f">Unpaid months (at least)<input type="number" min="1" max="12" value={f.min_months} onChange={(e) => setF({ ...f, min_months: e.target.value })} /></label>}
        <label className="f">Count months up to<select value={f.upto} onChange={(e) => setF({ ...f, upto: e.target.value })}>{months.map(m => <option key={m} value={m}>{long(m)}</option>)}</select></label>
      </div>
      <label className="row small"><input type="checkbox" checked={f.unbilled} onChange={(e) => setF({ ...f, unbilled: e.target.checked })} /> Count months that were never billed as unpaid</label>
    </div>
    <ErrorBox error={error} />
    {!d ? <Loading /> : <div className="card flush">
      <div className="card-head no-print"><b>{rows.length} student{rows.length === 1 ? '' : 's'} · {inr(d.total_due)} due</b>{loading && <span className="small muted">Updating…</span>}<div className="spacer" />
        <button className="btn sm secondary" disabled={!rows.length} onClick={csv}>⬇ CSV</button>
        <button className="btn sm secondary" disabled={!rows.length} onClick={() => window.print()}>🖨 Print</button>
        <button className="btn sm" disabled={!sel.size} onClick={remind}>📢 Send fee reminder{sel.size ? ` (${sel.size})` : ''}</button></div>
      <div className="table-wrap"><table>
        <thead><tr><th className="no-print"><input type="checkbox" aria-label="Select all" checked={!!rows.length && sel.size === rows.length} onChange={(e) => setSel(e.target.checked ? new Set(rows.map(r => r.id)) : new Set())} /></th>
          <th>Student</th><th>Class</th><th>Mobile</th><th>Unpaid months</th><th className="num">Previous years</th><th className="num">Total due</th><th>Last paid</th><th className="no-print" /></tr></thead>
        <tbody>{rows.map(r => <tr key={r.id}>
          <td className="no-print"><input type="checkbox" checked={sel.has(r.id)} onChange={(e) => setSel(s => { const n = new Set(s); e.target.checked ? n.add(r.id) : n.delete(r.id); return n; })} aria-label={`Select ${r.name}`} /></td>
          <td><b>{r.name}</b><div className="small muted">{r.admission_no} · {r.father_name || '—'}</div></td>
          <td className="nowrap">{r.class}-{r.section}</td>
          <td className="nowrap">{r.mobile ? <a href={`tel:${r.mobile}`}>{r.mobile}</a> : '—'}</td>
          <td><div className="row" style={{ gap: 4 }}>{r.unpaid_months.map(m => <span key={m.period} className={`badge ${m.billed ? 'bad' : 'warn'}`} title={`${long(m.period)}: ${inr(m.balance)}${m.billed ? '' : ' (not billed yet)'}`}>{short(m.period)}</span>)}
            {!r.unpaid_months.length && <span className="small muted">—</span>}</div>{r.unpaid_months.length > 0 && <div className="small muted">{r.unpaid_months.length} month{r.unpaid_months.length > 1 ? 's' : ''} · {inr(r.month_due)}</div>}</td>
          <td className="num">{r.past_due > 0 ? inr(r.past_due) : '—'}{r.other_due > 0 && <div className="small muted">+ other {inr(r.other_due)}</div>}</td>
          <td className="num"><b>{inr(r.total_due)}</b></td>
          <td className="nowrap">{r.last_paid_on ? fmtDate(r.last_paid_on) : <span className="muted">Never</span>}</td>
          <td className="no-print right"><button className="btn sm ok" onClick={() => onCollect(r.id)}>Collect</button></td></tr>)}</tbody>
      </table>{!rows.length && <div className="empty">No students match. Everyone is paid up for this selection. 🎉</div>}</div>
      <div className="card-head small muted">Red month = billed and unpaid · Yellow month = not billed yet (counted because of the tick above)</div>
    </div>}
  </div>);
}
