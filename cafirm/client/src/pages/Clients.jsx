import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';
import { Empty, ErrorMsg, Field, Loading, Modal, Tabs, ROLE_LABEL, useLoad, useToast, Toast } from '../ui.jsx';
import { FilingsPage } from './Filings.jsx';
import { DocumentsPage } from './Documents.jsx';
import { RegistrationsPage } from './Registrations.jsx';
import { SendMessage } from './Notifications.jsx';

function ClientForm({ client, onClose, onDone }) {
  const types = useLoad(() => api.get('/entity-types'));
  const [f, setF] = useState(client || { name: '', entity_type: '', pan: '', gstin: '', cin: '', email: '', phone: '', address: '', gst_registered: false, has_employees: false, tds_applicable: false });
  const [login, setLogin] = useState({ username: '', password: '' }), [withLogin, setWithLogin] = useState(!client), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      const r = client ? await api.put(`/clients/${client.id}`, f) : await api.post('/clients', { ...f, login: withLogin && login.username ? login : undefined });
      onDone(r);
    } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  return (
    <Modal title={client ? 'Edit organisation' : 'New customer organisation'} onClose={onClose} wide>
      <form onSubmit={submit} className="form-grid">
        <Field label="Organisation / person name" wide><input value={f.name} onChange={set('name')} required /></Field>
        <Field label="Type of institution" hint="Decides which compliances apply"><select value={f.entity_type} onChange={set('entity_type')} required><option value="">Choose…</option>{types.data?.map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}</select></Field>
        <Field label="PAN"><input value={f.pan || ''} onChange={set('pan')} maxLength={10} style={{ textTransform: 'uppercase' }} /></Field>
        <Field label="GSTIN" hint="Leave empty if not registered under GST"><input value={f.gstin || ''} onChange={set('gstin')} maxLength={15} style={{ textTransform: 'uppercase' }} /></Field>
        <Field label="CIN / LLPIN (if any)"><input value={f.cin || ''} onChange={set('cin')} /></Field>
        <Field label="Email"><input type="email" value={f.email || ''} onChange={set('email')} /></Field>
        <Field label="Phone"><input value={f.phone || ''} onChange={set('phone')} /></Field>
        <Field label="Address" wide><textarea value={f.address || ''} onChange={set('address')} style={{ minHeight: 56 }} /></Field>
        <div className="wide"><b className="small muted">Applicable registrations</b>
          <label className="check"><input type="checkbox" checked={!!(f.gst_registered || f.gstin)} onChange={set('gst_registered')} disabled={!!f.gstin} />Registered under GST (adds GSTR-1, GSTR-3B, GSTR-9)</label>
          <label className="check"><input type="checkbox" checked={!!f.has_employees} onChange={set('has_employees')} />Has employees (adds PF and ESI)</label>
          <label className="check"><input type="checkbox" checked={!!f.tds_applicable} onChange={set('tds_applicable')} />Deducts TDS (adds TDS payment and returns)</label></div>
        {!client && <div className="wide card" style={{ margin: 0 }}>
          <label className="check"><input type="checkbox" checked={withLogin} onChange={(e) => setWithLogin(e.target.checked)} /><b>Create a customer login now</b></label>
          {withLogin && <div className="form-grid" style={{ marginTop: 10 }}>
            <Field label="Username"><input value={login.username} onChange={(e) => setLogin({ ...login, username: e.target.value })} autoCapitalize="none" required /></Field>
            <Field label="Temporary password" hint="At least 8 characters"><input value={login.password} onChange={(e) => setLogin({ ...login, password: e.target.value })} minLength={8} required /></Field></div>}
        </div>}
        <div className="wide"><ErrorMsg error={err} /><button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button></div>
      </form>
    </Modal>
  );
}

export function ClientsPage() {
  const { user } = useAuth();
  const [q, setQ] = useState(''), [add, setAdd] = useState(false), [toast, say] = useToast(), nav = useNavigate();
  const s = useLoad(() => api.get(`/clients?${new URLSearchParams(q ? { q } : {})}`), [q]);
  return (
    <>
      <div className="page-head"><div><h1>Clients</h1><p className="muted">All customer organisations</p></div>
        {user.role === 'admin' && <button className="primary" onClick={() => setAdd(true)}>New client</button>}</div>
      <div className="filters"><input className="grow" placeholder="Search by name, PAN or GSTIN" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <Loading state={s} />
      {s.data && (s.data.length === 0 ? <Empty>No clients found.</Empty> : (
        <table><thead><tr><th>Name</th><th>Type</th><th>PAN</th><th>Open filings</th><th>Overdue</th></tr></thead>
          <tbody>{s.data.map((c) => (
            <tr key={c.id} className="click" onClick={() => nav(`/clients/${c.id}`)}>
              <td data-label="Name"><b>{c.name}</b>{!c.active && <span className="chip grey">Inactive</span>}<div className="muted small">{c.logins} login(s)</div></td>
              <td data-label="Type">{c.entity_name}</td><td data-label="PAN">{c.pan || '–'}</td>
              <td data-label="Open filings">{c.open_filings}</td>
              <td data-label="Overdue">{c.overdue ? <span className="chip red" style={{ margin: 0 }}>{c.overdue}</span> : '–'}</td>
            </tr>))}</tbody></table>))}
      {add && <ClientForm onClose={() => setAdd(false)} onDone={(r) => { setAdd(false); say(`Client created with ${r.filings_created} compliances`); s.reload(); nav(`/clients/${r.id}`); }} />}
      <Toast msg={toast} />
    </>
  );
}

export function ClientDetail() {
  const { id } = useParams(), { user } = useAuth(), admin = user.role === 'admin';
  const s = useLoad(() => api.get(`/clients/${id}`), [id]);
  const [tab, setTab] = useState('filings'), [edit, setEdit] = useState(false), [msg, setMsg] = useState(false), [toast, say] = useToast();
  const c = s.data;
  return (
    <>
      <p><Link to="/clients">← All clients</Link></p>
      <Loading state={s} />
      {c && <>
        <div className="page-head"><div><h1>{c.name}</h1><p className="muted">{c.entity_name}{c.pan ? ` · PAN ${c.pan}` : ''}{c.gstin ? ` · GSTIN ${c.gstin}` : ''}</p></div>
          <div className="actions"><button onClick={() => setMsg(true)}>Send message</button>{admin && <button onClick={() => setEdit(true)}>Edit</button>}</div></div>
        <Tabs tabs={[['filings', 'Filings'], ['documents', 'Documents'], ['registrations', 'Registrations'], ['profile', 'Profile & logins']]} value={tab} onChange={setTab} />
        {tab === 'filings' && <FilingsPage clientId={c.id} />}
        {tab === 'documents' && <DocumentsPage clientId={c.id} />}
        {tab === 'registrations' && <RegistrationsPage clientId={c.id} />}
        {tab === 'profile' && <div className="card">
          <dl className="kv"><dt>Email</dt><dd>{c.email || '–'}</dd><dt>Phone</dt><dd>{c.phone || '–'}</dd><dt>Address</dt><dd>{c.address || '–'}</dd><dt>CIN / LLPIN</dt><dd>{c.cin || '–'}</dd>
            <dt>Registrations</dt><dd>{[c.gst_registered && 'GST', c.has_employees && 'PF/ESI (employees)', c.tds_applicable && 'TDS'].filter(Boolean).join(', ') || 'None'}</dd></dl>
          <h3>Customer logins</h3>
          {c.users.length === 0 ? <p className="muted">No login yet.{admin && <> Create one in <Link to="/users">Users &amp; logins</Link>.</>}</p> :
            <ul>{c.users.map((u) => <li key={u.id}>{u.name} – <code>{u.username}</code>{!u.active && ' (disabled)'}</li>)}</ul>}
        </div>}
        {edit && <ClientForm client={c} onClose={() => setEdit(false)} onDone={(r) => { setEdit(false); s.reload(); say(r.filings_created ? `${r.filings_created} new compliances added` : 'Saved'); }} />}
        {msg && <Modal title={`Message ${c.name}`} onClose={() => setMsg(false)}><SendMessage fixedClient={c.id} onSent={() => { setMsg(false); say('Message sent'); }} /></Modal>}
      </>}
      <Toast msg={toast} />
    </>
  );
}
