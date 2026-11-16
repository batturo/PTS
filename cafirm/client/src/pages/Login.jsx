import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { ErrorMsg, Field } from '../ui.jsx';

const DEMO = import.meta.env.VITE_SHOW_DEMO === '1';
const DEMO_LOGINS = [['Administrator', 'admin', 'admin123'], ['CA', 'ca', 'ca123456'], ['Intern', 'intern', 'intern123'], ['Customer', 'acme', 'customer123']];

function Setup({ onLogin }) {
  const [f, setF] = useState({ setup_code: '', name: '', username: '', password: '' }), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const go = async (e) => { e.preventDefault(); setErr(''); setBusy(true); try { onLogin(await api.post('/auth/setup', f)); } catch (x) { setErr(x.message); } finally { setBusy(false); } };
  return (
    <div className="login">
      <form className="card" onSubmit={go}>
        <img src="/icon.svg" alt="" />
        <h1>Set up your portal</h1>
        <p className="muted">Create the Administrator login. You will need the one-time setup code from the deploy log.</p>
        <div className="form-grid" style={{ marginTop: 14 }}>
          <Field label="Setup code" wide><input value={f.setup_code} onChange={set('setup_code')} autoCapitalize="none" required autoFocus /></Field>
          <Field label="Your name" wide><input value={f.name} onChange={set('name')} required /></Field>
          <Field label="Username" wide><input value={f.username} onChange={set('username')} autoCapitalize="none" required /></Field>
          <Field label="Password" hint="At least 8 characters" wide><input type="password" autoComplete="new-password" minLength={8} value={f.password} onChange={set('password')} required /></Field>
        </div>
        <ErrorMsg error={err} />
        <button className="primary" style={{ width: '100%', marginTop: 8 }} disabled={busy}>{busy ? 'Creating…' : 'Create Administrator'}</button>
      </form>
    </div>
  );
}

export default function Login({ onLogin }) {
  const [needsSetup, setNeedsSetup] = useState(false);
  useEffect(() => { api.get('/auth/setup-status').then((r) => setNeedsSetup(r.needed), () => {}); }, []);
  if (needsSetup) return <Setup onLogin={onLogin} />;
  return <SignIn onLogin={onLogin} />;
}

function SignIn({ onLogin }) {
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
