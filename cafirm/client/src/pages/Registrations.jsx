import React, { useState } from 'react';
import { api } from '../api.js';
import { useAuth, isStaff } from '../App.jsx';
import { Badge, Empty, ErrorMsg, Field, Loading, Modal, REG_STATUSES, STATUS, Tabs, fmtDate, useLoad, useToast, Toast } from '../ui.jsx';
import { DocTable, UploadForm } from './Documents.jsx';

function Apply({ type, clientId, onClose, onDone }) {
  const [notes, setNotes] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const submit = async (e) => { e.preventDefault(); setBusy(true); try { await api.post('/registrations', { type_id: type.id, client_id: clientId, applicant_notes: notes }); onDone(); } catch (x) { setErr(x.message); } finally { setBusy(false); } };
  return (
    <Modal title={type.name} onClose={onClose}>
      <p>{type.description}</p>
      {type.required_documents && <><h3>Documents usually required</h3><pre className="wrap">{type.required_documents}</pre></>}
      <p className="muted small">{type.timeline && <>Typical time: {type.timeline}. </>}{type.fee_note || 'Our fee is quoted after we review your requirement.'}</p>
      <form onSubmit={submit}>
        <Field label="Anything we should know? (optional)"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. proposed name, number of directors, state" /></Field>
        <ErrorMsg error={err} /><button className="primary" style={{ marginTop: 10 }} disabled={busy}>{busy ? 'Submitting…' : 'Apply for this registration'}</button>
      </form>
    </Modal>
  );
}

function RequestDetail({ r, onClose, onChanged }) {
  const { user } = useAuth(), staff = isStaff(user);
  const docs = useLoad(() => api.get(`/documents?request_id=${r.id}&client_id=${r.client_id}`), [r.id]);
  const staffList = useLoad(() => (staff ? api.get('/staff') : Promise.resolve([])), [staff]);
  const [f, setF] = useState({ status: r.status, staff_notes: r.staff_notes || '', assigned_to: r.assigned_to || '', message: '', notify: true }), [err, setErr] = useState(''), [ok, setOk] = useState(false);
  const save = async (e) => { e.preventDefault(); setErr(''); setOk(false); try { await api.patch(`/registrations/${r.id}`, { ...f, assigned_to: f.assigned_to || null }); setOk(true); onChanged(); } catch (x) { setErr(x.message); } };
  return (
    <Modal title={r.type_name} onClose={onClose} wide>
      <dl className="kv"><dt>Client</dt><dd>{r.client_name}</dd><dt>Status</dt><dd><Badge status={r.status} /></dd><dt>Applied on</dt><dd>{fmtDate(r.created_at)}</dd>{r.applicant_notes && <><dt>Customer notes</dt><dd><pre className="wrap">{r.applicant_notes}</pre></dd></>}</dl>
      {staff && <form className="card" onSubmit={save} style={{ marginTop: 14 }}><h2 style={{ marginBottom: 10 }}>Update request</h2><div className="form-grid">
        <Field label="Status"><select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>{REG_STATUSES.map((k) => <option key={k} value={k}>{STATUS[k][0]}</option>)}</select></Field>
        <Field label="Assigned to"><select value={f.assigned_to} onChange={(e) => setF({ ...f, assigned_to: e.target.value })}><option value="">Unassigned</option>{staffList.data?.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
        <Field label="Message to the customer" wide><textarea value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} /></Field>
        <Field label="Internal notes" wide><textarea value={f.staff_notes} onChange={(e) => setF({ ...f, staff_notes: e.target.value })} /></Field>
        <label className="check wide"><input type="checkbox" checked={f.notify} onChange={(e) => setF({ ...f, notify: e.target.checked })} />Notify the customer</label></div>
        <ErrorMsg error={err} />{ok && <div className="alert ok">Saved.</div>}<button className="primary" style={{ marginTop: 8 }}>Save</button></form>}
      <h3>Documents</h3>
      {docs.data && <DocTable docs={docs.data} onChange={docs.reload} />}
      <h3>{staff ? 'Upload a document' : 'Send a document'}</h3>
      <UploadForm clientId={r.client_id} requestId={r.id} onDone={docs.reload} />
    </Modal>
  );
}

export function RegistrationsPage({ clientId }) {
  const { user } = useAuth(), staff = isStaff(user);
  const [tab, setTab] = useState(staff ? 'requests' : 'new'), [apply, setApply] = useState(null), [open, setOpen] = useState(null), [q, setQ] = useState(''), [toast, say] = useToast();
  const types = useLoad(() => api.get('/registration-types'));
  const reqs = useLoad(() => api.get(`/registrations${clientId ? `?client_id=${clientId}` : ''}`), [clientId]);
  const clients = useLoad(() => (staff && !clientId ? api.get('/clients?active=1') : Promise.resolve([])), [staff, clientId]);
  const [onBehalf, setOnBehalf] = useState('');
  const list = (types.data || []).filter((t) => !q || `${t.name} ${t.category} ${t.description}`.toLowerCase().includes(q.toLowerCase()));
  const cats = [...new Set(list.map((t) => t.category))];
  const target = clientId || onBehalf;
  return (
    <>
      {!clientId && <div className="page-head"><div><h1>{staff ? 'Registrations' : 'New registrations'}</h1><p className="muted">{staff ? 'Company registrations and licences requested by customers' : 'Apply for company registrations, tax registrations and licences'}</p></div></div>}
      <Tabs tabs={[...(staff ? [['requests', 'Requests']] : []), ['new', staff ? 'Start a registration' : 'Apply for a registration'], ...(!staff ? [['requests', 'My applications']] : [])]} value={tab} onChange={setTab} />
      {tab === 'requests' && <>
        <Loading state={reqs} />
        {reqs.data && (reqs.data.length === 0 ? <Empty>{staff ? 'No registration requests yet.' : 'You have not applied for anything yet.'}</Empty> :
          <table><thead><tr>{staff && !clientId && <th>Client</th>}<th>Registration</th><th>Status</th><th>Updated</th>{staff && <th>Assigned</th>}</tr></thead><tbody>{reqs.data.map((r) => (
            <tr key={r.id} className="click" onClick={() => setOpen(r)}>{staff && !clientId && <td data-label="Client">{r.client_name}</td>}<td data-label="Registration"><b>{r.type_name}</b><div className="muted small">{r.category}</div></td>
              <td data-label="Status"><Badge status={r.status} /></td><td data-label="Updated">{fmtDate(r.updated_at)}</td>{staff && <td data-label="Assigned">{r.assigned_name || '–'}</td>}</tr>))}</tbody></table>)}</>}
      {tab === 'new' && <>
        <div className="filters">
          {staff && !clientId && <select value={onBehalf} onChange={(e) => setOnBehalf(e.target.value)}><option value="">Choose the client…</option>{clients.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
          <input className="grow" placeholder="Search registrations" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Loading state={types} />
        {cats.map((c) => <div key={c}><h3>{c}</h3><div className="cards">{list.filter((t) => t.category === c).map((t) => (
          <div className="card" key={t.id}><b>{t.name}</b><span className="muted small">{t.description}</span><span className="muted small">{t.timeline && `⏱ ${t.timeline}`}</span>
            <button className="primary" style={{ marginTop: 'auto' }} disabled={staff && !target} onClick={() => setApply(t)}>{staff ? 'Start for client' : 'View & apply'}</button></div>))}</div></div>)}
      </>}
      {apply && <Apply type={apply} clientId={target || undefined} onClose={() => setApply(null)} onDone={() => { setApply(null); setTab('requests'); reqs.reload(); say('Request submitted'); }} />}
      {open && <RequestDetail r={open} onClose={() => setOpen(null)} onChanged={() => { reqs.reload(); }} />}
      <Toast msg={toast} />
    </>
  );
}
