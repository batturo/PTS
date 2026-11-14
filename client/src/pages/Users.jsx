import { useState } from 'react';
import { post, put, del } from '../api.js';
import { useData, Page, Modal, Field, Loading, ErrorBox, Badge, run, confirmDo, useAuth } from '../ui.jsx';

const ROLES = [['admin', 'School Administrator'], ['accountant', 'Accountant'], ['teacher', 'Teacher'], ['driver', 'Bus Driver'], ['librarian', 'Librarian'], ['student', 'Student'], ['parent', 'Parent']];
const label = Object.fromEntries(ROLES);

export function CredentialBox({ creds, onClose }) {
  const text = creds.map(c => `${label[c.role]}: ${c.name}\nUsername: ${c.username}\nPassword: ${c.password}`).join('\n\n');
  return (<Modal title="Login details created" onClose={onClose} footer={<>
    <button className="btn secondary" onClick={() => { navigator.clipboard?.writeText(text); }}>Copy</button>
    <button className="btn secondary" onClick={() => window.print()}>Print</button><button className="btn" onClick={onClose}>Done</button></>}>
    <div className="alert info" style={{ marginBottom: 12 }}>Share these details with the user. The password is shown only once — they can change it after logging in.</div>
    <div className="grid">{creds.map(c => <div key={c.username} className="card"><Badge tone="primary">{label[c.role]}</Badge><h3 style={{ marginTop: 8 }}>{c.name}</h3>
      <div>Username: <b>{c.username}</b></div><div>Password: <b style={{ fontFamily: 'monospace', fontSize: 16 }}>{c.password}</b></div></div>)}</div>
  </Modal>);
}

export default function Users() {
  const { user: me } = useAuth();
  const [role, setRole] = useState('');
  const [rows, reload, { error }] = useData(`/users${role ? `?role=${role}` : ''}`);
  const [form, setForm] = useState(null);
  const [creds, setCreds] = useState(null);
  const [q, setQ] = useState('');

  const create = async (e) => {
    e.preventDefault();
    const r = await run(() => post('/users', form));
    if (r) { setForm(null); setCreds([r]); reload(); }
  };
  const reset = async (u) => { if (!confirmDo(`Generate a new password for ${u.name}?`)) return; const r = await run(() => post(`/users/${u.id}/reset-password`)); if (r) setCreds([{ ...u, password: r.password }]); };
  const toggle = async (u) => { if (await run(() => put(`/users/${u.id}`, { active: u.active ? 0 : 1 }), u.active ? 'Account disabled' : 'Account enabled')) reload(); };
  const remove = async (u) => { if (confirmDo(`Permanently delete ${u.name}'s login?`) && await run(() => del(`/users/${u.id}`), 'Deleted')) reload(); };
  const list = (rows || []).filter(u => !q || `${u.name} ${u.username} ${u.admission_no || ''}`.toLowerCase().includes(q.toLowerCase()));

  return (<Page title="User Accounts" sub="Create logins for administrators, accountants, teachers, bus drivers and librarians. Student & parent logins are created with the student record."
    actions={<button className="btn" onClick={() => setForm({ role: 'teacher' })}>＋ Create user</button>}>
    <div className="filters">
      <select value={role} onChange={(e) => setRole(e.target.value)}><option value="">All roles</option>{ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      <input placeholder="Search name / username" value={q} onChange={(e) => setQ(e.target.value)} />
    </div>
    <ErrorBox error={error} />
    {!rows ? <Loading /> : <div className="card flush"><div className="table-wrap"><table>
      <thead><tr><th>Name</th><th>Username</th><th>Role</th><th className="hide-sm">Phone</th><th>Status</th><th /></tr></thead>
      <tbody>{list.map(u => <tr key={u.id}>
        <td><b>{u.name}</b>{u.admission_no && <div className="small muted">Adm. {u.admission_no} · {u.class}-{u.section}</div>}</td>
        <td>{u.username}</td><td><Badge tone="primary">{label[u.role]}</Badge></td><td className="hide-sm">{u.phone || '—'}</td>
        <td><Badge tone={u.active ? 'ok' : 'bad'}>{u.active ? 'Active' : 'Disabled'}</Badge></td>
        <td className="nowrap right">{u.id !== me.id && <>
          <button className="btn sm secondary" onClick={() => reset(u)}>Reset password</button>{' '}
          <button className="btn sm secondary" onClick={() => toggle(u)}>{u.active ? 'Disable' : 'Enable'}</button>{' '}
          <button className="btn sm ghost" onClick={() => remove(u)} aria-label="Delete">🗑</button></>}</td>
      </tr>)}</tbody></table></div></div>}

    {form && <Modal title="Create user account" onClose={() => setForm(null)} footer={<><button className="btn secondary" onClick={() => setForm(null)}>Cancel</button><button className="btn" form="uf">Create account</button></>}>
      <form id="uf" className="form-grid" onSubmit={create}>
        {[{ name: 'role', label: 'Role', type: 'select', required: true, noBlank: true, options: ROLES.slice(0, 5).map(([value, label]) => ({ value, label })) },
          { name: 'name', label: 'Full name', required: true }, { name: 'username', label: 'Username', required: true, hint: 'Used to log in, e.g. anita.verma' },
          { name: 'password', label: 'Password', hint: 'Leave blank to generate one automatically' }, { name: 'phone', label: 'Mobile number', type: 'tel' }, { name: 'email', label: 'Email', type: 'email' },
        ].map(f => <Field key={f.name} f={f} value={form[f.name]} onChange={(k, v) => setForm({ ...form, [k]: v })} />)}
      </form>
      {form.role === 'driver' && <div className="alert info" style={{ marginTop: 12 }}>After creating the driver, assign them a bus route under Transport → Bus Routes (or the driver can set their own route).</div>}
      {['teacher', 'accountant', 'librarian', 'driver'].includes(form.role) && <div className="small muted" style={{ marginTop: 10 }}>Tip: the accountant can link this login to an employee record in Payroll so the user can view their own payslips.</div>}
    </Modal>}
    {creds && <CredentialBox creds={creds} onClose={() => setCreds(null)} />}
  </Page>);
}
