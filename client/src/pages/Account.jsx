import { useState } from 'react';
import { post } from '../api.js';
import { Page, run, useAuth } from '../ui.jsx';
export default function Account() {
  const { user } = useAuth();
  const [f, setF] = useState({ current: '', next: '', confirm: '' });
  const submit = async (e) => {
    e.preventDefault();
    if (f.next !== f.confirm) return run(() => Promise.reject(new Error('New passwords do not match')));
    if (await run(() => post('/auth/change-password', f), 'Password changed')) setF({ current: '', next: '', confirm: '' });
  };
  return (<Page title="Change Password" sub={`Logged in as ${user.username}`}>
    <form className="card stack" style={{ maxWidth: 420 }} onSubmit={submit}>
      {[['current', 'Current password'], ['next', 'New password (min 6 characters)'], ['confirm', 'Confirm new password']].map(([k, l]) =>
        <label key={k} className="f">{l}<input type="password" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} required minLength={k === 'current' ? 1 : 6} /></label>)}
      <div><button className="btn">Update password</button></div>
    </form>
  </Page>);
}
