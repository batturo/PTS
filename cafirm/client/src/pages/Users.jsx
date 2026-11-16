import React, { useState } from 'react';
import { api } from '../api.js';
import { Empty, ErrorMsg, Field, Loading, Modal, ROLE_LABEL, useLoad, useToast, Toast } from '../ui.jsx';

function UserForm({ user, onClose, onDone }) {
  const clients = useLoad(() => api.get('/clients'));
  const [f, setF] = useState(user ? { ...user } : { username: '', password: '', role: 'ca', name: '', phone: '', email: '', client_id: '' });
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { user ? await api.put(`/users/${user.id}`, f) : await api.post('/users', f); onDone(); } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  return (
    <Modal title={user ? `Edit ${user.username}` : 'Create a login'} onClose={onClose}>
      <form onSubmit={submit} className="form-grid">
        <Field label="Role"><select value={f.role} onChange={set('role')}>{Object.entries(ROLE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Full name"><input value={f.name} onChange={set('name')} required /></Field>
        {!user && <Field label="Username"><input value={f.username} onChange={set('username')} autoCapitalize="none" required /></Field>}
        {!user && <Field label="Temporary password" hint="At least 8 characters"><input value={f.password} onChange={set('password')} minLength={8} required /></Field>}
        {f.role === 'customer' && <Field label="Organisation" wide><select value={f.client_id || ''} onChange={set('client_id')} required><option value="">Choose…</option>{clients.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>}
        <Field label="Email"><input type="email" value={f.email || ''} onChange={set('email')} /></Field>
        <Field label="Phone"><input value={f.phone || ''} onChange={set('phone')} /></Field>
        <div className="wide"><ErrorMsg error={err} /><button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button></div>
      </form>
    </Modal>
  );
}

function ResetPassword({ user, onClose, onDone }) {
  const [pw, setPw] = useState(''), [err, setErr] = useState('');
  const submit = async (e) => { e.preventDefault(); try { await api.post(`/users/${user.id}/reset-password`, { password: pw }); onDone(); } catch (x) { setErr(x.message); } };
  return <Modal title={`Reset password – ${user.username}`} onClose={onClose}><form onSubmit={submit}><Field label="New password" hint="Tell the user this password; they can change it after logging in"><input value={pw} onChange={(e) => setPw(e.target.value)} minLength={8} required /></Field><ErrorMsg error={err} /><button className="primary" style={{ marginTop: 10 }}>Reset password</button></form></Modal>;
}

export default function UsersPage() {
  const [role, setRole] = useState(''), [q, setQ] = useState(''), [form, setForm] = useState(null), [reset, setReset] = useState(null), [toast, say] = useToast();
  const s = useLoad(() => api.get(`/users?${new URLSearchParams({ ...(role ? { role } : {}), ...(q ? { q } : {}) })}`), [role, q]);
  const toggle = async (u) => { try { await api.put(`/users/${u.id}`, { active: !u.active }); s.reload(); say(u.active ? 'Login disabled' : 'Login enabled'); } catch (e) { say(e.message); } };
  return (
    <>
      <div className="page-head"><div><h1>Users &amp; logins</h1><p className="muted">Create and manage Administrators, CAs, Interns and customers</p></div><button className="primary" onClick={() => setForm({})}>Create login</button></div>
      <div className="filters"><input className="grow" placeholder="Search name or username" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={role} onChange={(e) => setRole(e.target.value)}><option value="">All roles</option>{Object.entries(ROLE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
      <Loading state={s} />
      {s.data && (s.data.length === 0 ? <Empty>No users.</Empty> : <table><thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Organisation</th><th></th></tr></thead><tbody>{s.data.map((u) => (
        <tr key={u.id}><td data-label="Name"><b>{u.name}</b>{!u.active && <span className="chip grey">Disabled</span>}<div className="muted small">{u.email}</div></td><td data-label="Username"><code>{u.username}</code></td><td data-label="Role">{ROLE_LABEL[u.role]}</td><td data-label="Organisation">{u.client_name || '–'}</td>
          <td className="nowrap"><button className="small" onClick={() => setForm(u)}>Edit</button> <button className="small" onClick={() => setReset(u)}>Reset password</button> <button className="small" onClick={() => toggle(u)}>{u.active ? 'Disable' : 'Enable'}</button></td></tr>))}</tbody></table>)}
      {form && <UserForm user={form.id ? form : null} onClose={() => setForm(null)} onDone={() => { setForm(null); s.reload(); say('Saved'); }} />}
      {reset && <ResetPassword user={reset} onClose={() => setReset(null)} onDone={() => { setReset(null); say('Password reset'); }} />}
      <Toast msg={toast} />
    </>
  );
}
