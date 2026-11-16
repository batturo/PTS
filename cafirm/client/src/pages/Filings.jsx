import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth, isStaff } from '../App.jsx';
import { Badge, DueChip, Empty, ErrorMsg, Field, FILING_STATUSES, Loading, Modal, STATUS, currentFY, fmtDate, fmtDateTime, fyOptions, useLoad, useToast, Toast } from '../ui.jsx';
import { DocTable, UploadForm } from './Documents.jsx';

const CATEGORIES = ['GST', 'Income Tax', 'TDS', 'ROC / MCA', 'Labour', 'Other'];

export function FilingDetail({ id, onClose, onChanged }) {
  const { user } = useAuth(), staff = isStaff(user), admin = user.role === 'admin';
  const s = useLoad(() => api.get(`/filings/${id}`), [id]);
  const staffList = useLoad(() => (staff ? api.get('/staff') : Promise.resolve([])), [staff]);
  const [f, setF] = useState(null), [err, setErr] = useState(''), [busy, setBusy] = useState(false), [saved, setSaved] = useState(false), [up, setUp] = useState(false);
  const d = s.data;
  useEffect(() => { if (d) setF({ status: d.status, remarks: d.remarks || '', internal_notes: d.internal_notes || '', ack_no: d.ack_no || '', filed_on: d.filed_on || '', assigned_to: d.assigned_to || '', due_date: d.due_date, message: '', notify: true }); }, [d]);

  const save = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true); setSaved(false);
    try {
      const body = { status: f.status, remarks: f.remarks, internal_notes: f.internal_notes, ack_no: f.ack_no, filed_on: f.filed_on || null, assigned_to: f.assigned_to || null, message: f.message, notify: f.notify };
      if (admin && f.due_date !== d.due_date) body.due_date = f.due_date;
      await api.patch(`/filings/${id}`, body);
      setSaved(true); s.reload(); onChanged?.(); window.dispatchEvent(new Event('notif-changed'));
    } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  const remove = async () => { if (!confirm('Delete this filing for this client?')) return; try { await api.del(`/filings/${id}`); onChanged?.(); onClose(); } catch (x) { setErr(x.message); } };

  return (
    <Modal title={d ? `${d.name} – ${d.period_label}` : 'Filing'} onClose={onClose} wide>
      <Loading state={s} />
      {d && f && <>
        <dl className="kv">
          {staff && <><dt>Client</dt><dd><Link to={`/clients/${d.client_id}`} onClick={onClose}>{d.client_name}</Link></dd></>}
          <dt>Category</dt><dd>{d.category}{d.form_no ? ` · Form ${d.form_no}` : ''}</dd>
          <dt>Financial year</dt><dd>{d.fy}</dd>
          <dt>Due date</dt><dd>{fmtDate(d.due_date)} <DueChip f={d} /></dd>
          <dt>Status</dt><dd><Badge status={d.status} /></dd>
          {d.filed_on && <><dt>Filed on</dt><dd>{fmtDate(d.filed_on)}</dd></>}
          {d.ack_no && <><dt>Acknowledgement no.</dt><dd>{d.ack_no}</dd></>}
          {d.remarks && <><dt>Note from your CA</dt><dd><pre className="wrap">{d.remarks}</pre></dd></>}
          {staff && <><dt>Assigned to</dt><dd>{d.assigned_name || 'Unassigned'}</dd></>}
        </dl>

        {staff && (
          <form onSubmit={save} className="card" style={{ marginTop: 16 }}>
            <h2 style={{ marginBottom: 10 }}>Update filing</h2>
            <div className="form-grid">
              <Field label="Status"><select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>{FILING_STATUSES.map((k) => <option key={k} value={k}>{STATUS[k][0]}</option>)}</select></Field>
              <Field label="Assigned to"><select value={f.assigned_to} onChange={(e) => setF({ ...f, assigned_to: e.target.value })}><option value="">Unassigned</option>{staffList.data?.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
              <Field label="Acknowledgement / ARN no."><input value={f.ack_no} onChange={(e) => setF({ ...f, ack_no: e.target.value })} /></Field>
              <Field label="Filed on" hint="Defaults to today when marked Filed"><input type="date" value={f.filed_on} onChange={(e) => setF({ ...f, filed_on: e.target.value })} /></Field>
              {admin && <Field label="Due date (Administrator)"><input type="date" value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} required /></Field>}
              <Field label="Note shown to the customer" wide><textarea value={f.remarks} onChange={(e) => setF({ ...f, remarks: e.target.value })} /></Field>
              <Field label="Internal notes (staff only)" wide><textarea value={f.internal_notes} onChange={(e) => setF({ ...f, internal_notes: e.target.value })} /></Field>
              <Field label="Message to the customer (optional)" hint="Sent as a notification together with the status change" wide><textarea value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} /></Field>
              <label className="check wide"><input type="checkbox" checked={f.notify} onChange={(e) => setF({ ...f, notify: e.target.checked })} />Notify the customer about this change</label>
            </div>
            <ErrorMsg error={err} />{saved && <div className="alert ok">Saved.</div>}
            <div className="actions" style={{ marginTop: 10 }}><button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>{admin && <button type="button" className="danger" onClick={remove}>Delete filing</button>}</div>
          </form>)}

        <h3>Documents</h3>
        <DocTable docs={d.documents.map((x) => ({ ...x, filing_name: null }))} onChange={s.reload} />
        <p style={{ marginTop: 10 }}><button onClick={() => setUp(!up)}>{up ? 'Cancel' : staff ? 'Upload a document for this filing' : 'Send a document for this filing'}</button></p>
        {up && <UploadForm clientId={d.client_id} filingId={d.id} onDone={() => { setUp(false); s.reload(); }} />}

        <h3>Progress</h3>
        {d.history.length === 0 ? <p className="muted">No updates yet.</p> : <ul className="timeline">{d.history.map((h) => (
          <li key={h.id}><b>{h.to_status === h.from_status ? 'Note added' : STATUS[h.to_status]?.[0]}</b> <span className="muted small">{fmtDateTime(h.at)} · {h.by_name}</span>{h.note && <div>{h.note}</div>}</li>))}</ul>}
      </>}
    </Modal>
  );
}

export function FilingsPage({ clientId }) {
  const { user } = useAuth(), staff = isStaff(user);
  const [sp, setSp] = useSearchParams();
  const preset = !!(sp.get('overdue') || sp.get('open') || sp.get('status') || sp.get('from'));
  const [q, setQ] = useState(''), [fy, setFy] = useState(preset ? '' : currentFY()), [status, setStatus] = useState(sp.get('status') || '');
  const [category, setCategory] = useState(''), [overdue, setOverdue] = useState(sp.get('overdue') === '1'), [openOnly, setOpenOnly] = useState(sp.get('open') === '1'), [mine, setMine] = useState(false);
  const range = { from: sp.get('from') || '', to: sp.get('to') || '' };
  const [openId, setOpenId] = useState(sp.get('filing') ? Number(sp.get('filing')) : null);
  const [add, setAdd] = useState(false), [toast, say] = useToast();
  const params = new URLSearchParams({ ...(clientId ? { client_id: clientId } : {}), ...(q ? { q } : {}), ...(fy ? { fy } : {}), ...(status ? { status } : {}), ...(category ? { category } : {}), ...(overdue ? { overdue: '1' } : {}), ...(openOnly ? { open: '1' } : {}), ...(mine ? { assigned_to: user.id } : {}), ...(range.from ? { from: range.from } : {}), ...(range.to ? { to: range.to } : {}) });
  const s = useLoad(() => api.get(`/filings?${params}`), [params.toString()]);
  const clearRange = () => { sp.delete('from'); sp.delete('to'); setSp(sp, { replace: true }); };

  return (
    <>
      {!clientId && <div className="page-head"><div><h1>{staff ? 'Filings' : 'My compliances'}</h1><p className="muted">{staff ? 'Every compliance of every client. Click a row to update it.' : 'Everything your organisation needs to comply with, with due dates and current status.'}</p></div>
        {user.role === 'admin' && <div className="actions"><button className="primary" onClick={() => setAdd(true)}>Add filing</button></div>}</div>}
      {clientId && user.role === 'admin' && <p><button onClick={() => setAdd(true)}>Add filing</button></p>}
      <div className="filters">
        <input className="grow" placeholder={staff ? 'Search compliance, client or period' : 'Search compliance or period'} value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={fy} onChange={(e) => setFy(e.target.value)}><option value="">All years</option>{fyOptions().map((y) => <option key={y} value={y}>FY {y}</option>)}</select>
        <select value={category} onChange={(e) => setCategory(e.target.value)}><option value="">All categories</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
        <select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option>{FILING_STATUSES.map((k) => <option key={k} value={k}>{STATUS[k][0]}</option>)}</select>
      </div>
      <div className="filters" style={{ alignItems: 'center' }}>
        <label className="check"><input type="checkbox" checked={overdue} onChange={(e) => setOverdue(e.target.checked)} />Overdue only</label>
        <label className="check"><input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} />Not yet filed</label>
        {staff && <label className="check"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} />Assigned to me</label>}
        {(range.from || range.to) && <button className="small" onClick={clearRange}>Due {fmtDate(range.from)} → {fmtDate(range.to)} ✕</button>}
      </div>
      <Loading state={s} />
      {s.data && (s.data.length === 0 ? <Empty>No filings match these filters.</Empty> : (
        <table><thead><tr>{staff && !clientId && <th>Client</th>}<th>Compliance</th><th>Period</th><th>Due date</th><th>Status</th>{staff && <th>Assigned</th>}</tr></thead>
          <tbody>{s.data.map((f) => (
            <tr key={f.id} className={`click ${f.overdue ? 'is-overdue' : ''}`} onClick={() => setOpenId(f.id)}>
              {staff && !clientId && <td data-label="Client">{f.client_name}</td>}
              <td data-label="Compliance"><b>{f.name}</b><div className="muted small">{f.category}{f.form_no ? ` · ${f.form_no}` : ''}</div></td>
              <td data-label="Period">{f.period_label}</td>
              <td data-label="Due date" className="nowrap">{fmtDate(f.due_date)}<DueChip f={f} /></td>
              <td data-label="Status"><Badge status={f.status} />{f.filed_on && <div className="muted small">on {fmtDate(f.filed_on)}</div>}</td>
              {staff && <td data-label="Assigned">{f.assigned_name || '–'}</td>}
            </tr>))}</tbody></table>))}
      {s.data?.length >= 500 && <p className="muted small">Showing the first 500 – narrow the filters to see others.</p>}
      {openId && <FilingDetail id={openId} onClose={() => setOpenId(null)} onChanged={s.reload} />}
      {add && <AddFiling clientId={clientId} onClose={() => setAdd(false)} onDone={() => { setAdd(false); s.reload(); say('Filing added'); }} />}
      <Toast msg={toast} />
    </>
  );
}

function AddFiling({ clientId, onClose, onDone }) {
  const clients = useLoad(() => api.get('/clients?active=1'));
  const [f, setF] = useState({ client_id: clientId || '', name: '', category: 'Other', due_date: '', period_label: 'One-time', fy: currentFY() }), [err, setErr] = useState('');
  const submit = async (e) => { e.preventDefault(); try { await api.post('/filings', f); onDone(); } catch (x) { setErr(x.message); } };
  return (
    <Modal title="Add a one-off filing" onClose={onClose}>
      <p className="muted small">For work that is not part of the standard compliance master (e.g. a notice reply, assessment). Standard compliances are generated automatically.</p>
      <form onSubmit={submit} className="form-grid">
        {!clientId && <Field label="Client" wide><select value={f.client_id} onChange={(e) => setF({ ...f, client_id: e.target.value })} required><option value="">Choose…</option>{clients.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>}
        <Field label="Name" wide><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></Field>
        <Field label="Category"><select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Due date"><input type="date" value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} required /></Field>
        <Field label="Period"><input value={f.period_label} onChange={(e) => setF({ ...f, period_label: e.target.value })} /></Field>
        <Field label="Financial year"><select value={f.fy} onChange={(e) => setF({ ...f, fy: e.target.value })}>{fyOptions().map((y) => <option key={y}>{y}</option>)}</select></Field>
        <div className="wide"><ErrorMsg error={err} /><button className="primary">Add filing</button></div>
      </form>
    </Modal>
  );
}
