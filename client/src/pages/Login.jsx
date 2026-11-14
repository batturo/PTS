import { useState, useEffect } from 'react';
import { post, setToken, get } from '../api.js';

const DEMO = [['Administrator', 'admin', 'admin123'], ['Accountant', 'accountant', 'accounts123'], ['Teacher', 'teacher', 'teacher123'], ['Librarian', 'librarian', 'library123'],
  ['Bus Driver', 'driver', 'driver123'], ['Student', '2026001', 'student123'], ['Parent', 'P2026001', 'parent123']];

export default function Login({ school, onLogin }) {
  const [f, setF] = useState({ username: '', password: '' });
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  // Check the server connection up front so setup problems are explained before anyone types a password.
  useEffect(() => { get('/health').catch((e) => setErr(e.message)); }, []);
  const submit = async (e) => {
    e?.preventDefault(); setBusy(true); setErr('');
    try { const r = await post('/auth/login', f); setToken(r.token); onLogin(await get('/auth/me')); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (<div className="login"><div className="card stack">
    <div style={{ textAlign: 'center' }}>
      <img src="./icon.svg" alt="" width="56" height="56" />
      <h1 style={{ marginTop: 8 }}>{school.school_name || 'School ERP'}</h1>
      <div className="muted small">{school.school_address}</div>
    </div>
    <form className="stack" onSubmit={submit}>
      <label className="f">Username / Admission No.<input autoComplete="username" autoCapitalize="none" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} required /></label>
      <label className="f">Password<input type="password" autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required /></label>
      {err && <div className="alert">{err}</div>}
      <button className="btn" style={{ width: '100%' }} disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
    </form>
    <div className="small muted" style={{ textAlign: 'center' }}>Login details are provided by the school. Students & parents: contact your class teacher.</div>
    {import.meta.env.DEV || import.meta.env.VITE_SHOW_DEMO ? <details><summary className="small muted">Demo logins</summary>
      <div className="demo-logins" style={{ marginTop: 8 }}>{DEMO.map(([l, u, p]) => <button key={u} className="btn secondary sm" type="button" onClick={() => setF({ username: u, password: p })}>{l}</button>)}</div>
    </details> : null}
  </div></div>);
}
