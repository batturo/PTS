import React, { useState } from 'react';
import { api } from '../api.js';
import { ErrorMsg, Field } from '../ui.jsx';

const DEMO = import.meta.env.VITE_SHOW_DEMO === '1';
const DEMO_LOGINS = [['Administrator', 'admin', 'admin123'], ['CA', 'ca', 'ca123456'], ['Intern', 'intern', 'intern123'], ['Customer', 'acme', 'customer123']];

export default function Login({ onLogin }) {
  const [f, setF] = useState({ username: '', password: '' });
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const go = async (e, creds = f) => {
    e?.preventDefault(); setErr(''); setBusy(true);
    try { onLogin(await api.post('/auth/login', creds)); } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  return (
    <div className="login">
      <form className="card" onSubmit={go}>
        <img src="/icon.svg" alt="" />
        <h1>CA Firm Portal</h1>
        <p className="muted">Sign in to view your compliances, filings and documents.</p>
        <div className="form-grid" style={{ marginTop: 14 }}>
          <Field label="Username" wide><input autoComplete="username" autoCapitalize="none" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} required autoFocus /></Field>
          <Field label="Password" wide><input type="password" autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required /></Field>
        </div>
        <ErrorMsg error={err} />
        <button className="primary" style={{ width: '100%', marginTop: 8 }} disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        {DEMO && <div style={{ marginTop: 14 }}><p className="muted small">Demo logins:</p><div className="actions">{DEMO_LOGINS.map(([l, u, p]) => <button type="button" className="small" key={u} onClick={() => go(null, { username: u, password: p })}>{l}</button>)}</div></div>}
      </form>
    </div>
  );
}
