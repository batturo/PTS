import React, { useRef, useState } from 'react';
import { api } from '../api.js';
import { useAuth, isStaff } from '../App.jsx';
import { DOC_KINDS, Empty, ErrorMsg, Field, Loading, Modal, fmtDate, fmtSize, useLoad, useToast, Toast } from '../ui.jsx';

/** Upload one file for a client (optionally tied to a filing or registration request). */
export function UploadForm({ clientId, filingId, requestId, onDone }) {
  const { user } = useAuth(), staff = isStaff(user);
  const [f, setF] = useState({ title: '', kind: 'compliance_document', visible: true, notify: true });
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const file = useRef();
  const submit = async (e) => {
    e.preventDefault(); setErr('');
    const fd = new FormData();
    if (clientId) fd.set('client_id', clientId);
    if (filingId) fd.set('filing_id', filingId);
    if (requestId) fd.set('request_id', requestId);
    fd.set('title', f.title); fd.set('kind', f.kind); fd.set('visible_to_client', f.visible ? '1' : '0'); fd.set('notify', f.notify ? '1' : '0');
    fd.set('file', file.current.files[0]);
    setBusy(true);
    try { const d = await api.post('/documents', fd); file.current.value = ''; setF({ ...f, title: '' }); onDone?.(d); } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="form-grid">
      <Field label="File" hint="PDF, image, Excel, Word, CSV, ZIP – up to 20 MB" wide><input type="file" ref={file} required /></Field>
      <Field label="Title (optional)"><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
      {staff && <Field label="Type of document"><select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{Object.entries(DOC_KINDS).filter(([k]) => k !== 'client_upload').map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>}
      {staff && <label className="check"><input type="checkbox" checked={f.visible} onChange={(e) => setF({ ...f, visible: e.target.checked })} />Visible to the customer</label>}
      {staff && f.visible && <label className="check"><input type="checkbox" checked={f.notify} onChange={(e) => setF({ ...f, notify: e.target.checked })} />Notify the customer</label>}
      <div className="wide"><ErrorMsg error={err} /><button className="primary" disabled={busy}>{busy ? 'Uploading…' : 'Upload'}</button></div>
    </form>
  );
}

export function DocTable({ docs, onChange, showClient }) {
  const { user } = useAuth(), staff = isStaff(user);
  const [err, setErr] = useState('');
  const dl = (d) => api.download(d).catch((e) => setErr(e.message));
  const del = async (d) => { if (!confirm(`Delete "${d.title}"?`)) return; try { await api.del(`/documents/${d.id}`); onChange?.(); } catch (e) { setErr(e.message); } };
  const toggle = async (d) => { try { await api.patch(`/documents/${d.id}`, { visible_to_client: !d.visible_to_client }); onChange?.(); } catch (e) { setErr(e.message); } };
  if (!docs.length) return <Empty>No documents yet.</Empty>;
  return (
    <>
      <ErrorMsg error={err} />
      <table><thead><tr><th>Document</th>{showClient && <th>Client</th>}<th>Type</th><th>Related to</th><th>Added</th><th></th></tr></thead>
        <tbody>{docs.map((d) => (
          <tr key={d.id}>
            <td data-label="Document"><b>{d.title}</b><div className="muted small">{d.original_name} · {fmtSize(d.size)}{staff && !d.visible_to_client && <span className="chip amber">Hidden from customer</span>}</div></td>
            {showClient && <td data-label="Client">{d.client_name}</td>}
            <td data-label="Type">{DOC_KINDS[d.kind] || d.kind}</td>
            <td data-label="Related to">{d.filing_name ? `${d.filing_name} (${d.period_label})` : '–'}</td>
            <td data-label="Added">{fmtDate(d.created_at)}<div className="muted small">{d.uploaded_by_name}</div></td>
            <td className="nowrap"><button className="small" onClick={() => dl(d)}>Download</button>{staff && <> <button className="small" onClick={() => toggle(d)}>{d.visible_to_client ? 'Hide' : 'Show'}</button></>} {(user.role === 'admin' || d.uploaded_by === user.id) && <button className="small danger" onClick={() => del(d)}>Delete</button>}</td>
          </tr>))}</tbody></table>
    </>
  );
}

export function DocumentsPage({ clientId }) {
  const { user } = useAuth(), staff = isStaff(user);
  const [q, setQ] = useState(''), [kind, setKind] = useState(''), [up, setUp] = useState(false), [toast, say] = useToast();
  const s = useLoad(() => api.get(`/documents?${new URLSearchParams({ ...(clientId ? { client_id: clientId } : {}), ...(q ? { q } : {}), ...(kind ? { kind } : {}) })}`), [clientId, q, kind]);
  const [pick, setPick] = useState('');
  const clients = useLoad(() => (staff && !clientId ? api.get('/clients?active=1') : Promise.resolve([])), [staff, clientId]);
  const target = clientId || pick;
  return (
    <>
      {!clientId && <div className="page-head"><div><h1>Documents</h1><p className="muted">{staff ? 'Compliance documents, tax reports and filing acknowledgements' : 'Documents and reports shared by your CA firm'}</p></div></div>}
      <div className="filters">
        <input className="grow" placeholder="Search documents" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={kind} onChange={(e) => setKind(e.target.value)}><option value="">All types</option>{Object.entries(DOC_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <button className="primary" onClick={() => setUp(true)}>{staff ? 'Upload document' : 'Send a document to the firm'}</button>
      </div>
      <Loading state={s} />
      {s.data && <DocTable docs={s.data} onChange={s.reload} showClient={staff && !clientId} />}
      {up && <Modal title="Upload document" onClose={() => setUp(false)}>
        {staff && !clientId && <Field label="Client" wide><select value={pick} onChange={(e) => setPick(e.target.value)} required><option value="">Choose client…</option>{clients.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>}
        {(!staff || target) ? <UploadForm clientId={target} onDone={() => { setUp(false); s.reload(); say('Document uploaded'); }} /> : <p className="muted">Choose a client first.</p>}
      </Modal>}
      <Toast msg={toast} />
    </>
  );
}
