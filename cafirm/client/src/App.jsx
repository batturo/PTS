import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { api, getToken, setToken } from './api.js';
import { ROLE_LABEL, Modal, Field, ErrorMsg } from './ui.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import { FilingsPage } from './pages/Filings.jsx';
import { ClientsPage, ClientDetail } from './pages/Clients.jsx';
import { DocumentsPage } from './pages/Documents.jsx';
import { NotificationsPage } from './pages/Notifications.jsx';
import { RegistrationsPage } from './pages/Registrations.jsx';
import UsersPage from './pages/Users.jsx';
import MastersPage from './pages/Masters.jsx';
import AuditPage from './pages/Audit.jsx';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);
export const isStaff = (u) => ['admin', 'ca', 'intern'].includes(u.role);

function ChangePassword({ onClose }) {
  const [f, setF] = useState({ current_password: '', new_password: '' });
  const [err, setErr] = useState(''), [done, setDone] = useState(false);
  const submit = async (e) => { e.preventDefault(); setErr(''); try { await api.post('/auth/change-password', f); setDone(true); } catch (x) { setErr(x.message); } };
  return (
    <Modal title="Change password" onClose={onClose}>
      {done ? <><div className="alert ok">Password changed.</div><button onClick={onClose}>Close</button></> : (
        <form onSubmit={submit} className="form-grid">
          <Field label="Current password" wide><input type="password" autoComplete="current-password" value={f.current_password} onChange={(e) => setF({ ...f, current_password: e.target.value })} required /></Field>
          <Field label="New password" hint="At least 8 characters" wide><input type="password" autoComplete="new-password" minLength={8} value={f.new_password} onChange={(e) => setF({ ...f, new_password: e.target.value })} required /></Field>
          <div className="wide"><ErrorMsg error={err} /><button className="primary">Change password</button></div>
        </form>)}
    </Modal>
  );
}

function Shell({ user, logout }) {
  const [open, setOpen] = useState(false), [pw, setPw] = useState(false), [unread, setUnread] = useState(0);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  const refresh = useCallback(() => api.get('/notifications/unread-count').then((r) => setUnread(r.count)).catch(() => {}), []);
  useEffect(() => { refresh(); const t = setInterval(refresh, 60000); window.addEventListener('notif-changed', refresh); return () => { clearInterval(t); window.removeEventListener('notif-changed', refresh); }; }, [refresh]);

  const staff = isStaff(user), admin = user.role === 'admin';
  const links = [
    ['/', 'Dashboard', '🏠'],
    ['/filings', staff ? 'All filings' : 'My compliances', '📅'],
    ...(staff ? [['/clients', 'Clients', '🏢']] : []),
    ['/registrations', staff ? 'Registrations' : 'New registrations', '📝'],
    ['/documents', 'Documents', '📁'],
    ['/notifications', staff ? 'Messages' : 'Notifications', '🔔', unread],
    ...(admin ? [['sep', 'Administration'], ['/users', 'Users & logins', '👥'], ['/masters', 'Compliance master', '⚙️'], ['/audit', 'Activity log', '🕘']] : []),
  ];
  return (
    <div className="shell">
      <div className="topbar"><button onClick={() => setOpen(true)} aria-label="Menu">☰</button>CA Firm Portal</div>
      <aside className={`side ${open ? 'open' : ''}`}>
        <div className="brand"><img src="/icon.svg" alt="" />CA Firm Portal</div>
        <nav className="nav">
          {links.map(([to, label, icon, count]) => to === 'sep' ? <div key={label} className="sep">{label}</div> :
            <NavLink key={to} to={to} end={to === '/'}><span aria-hidden>{icon}</span>{label}{count ? <span className="count">{count}</span> : null}</NavLink>)}
        </nav>
        <div className="userbox"><b>{user.name}</b>{ROLE_LABEL[user.role]}{user.client_name ? ` · ${user.client_name}` : ''}
          <div><button className="light" onClick={() => setPw(true)}>Password</button><button className="light" onClick={logout}>Log out</button></div></div>
      </aside>
      {open && <div style={{ position: 'fixed', inset: 0, zIndex: 25 }} onClick={() => setOpen(false)} />}
      <main className="main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/filings" element={<FilingsPage />} />
          <Route path="/registrations" element={<RegistrationsPage />} />
          <Route path="/documents" element={<DocumentsPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          {staff && <Route path="/clients" element={<ClientsPage />} />}
          {staff && <Route path="/clients/:id" element={<ClientDetail />} />}
          {admin && <Route path="/users" element={<UsersPage />} />}
          {admin && <Route path="/masters" element={<MastersPage />} />}
          {admin && <Route path="/audit" element={<AuditPage />} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      {pw && <ChangePassword onClose={() => setPw(false)} />}
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = still checking the saved login
  useEffect(() => {
    if (!getToken()) { setUser(null); return; }
    api.get('/auth/me').then(setUser, () => setUser(null));
    const expired = () => setUser(null);
    window.addEventListener('auth-expired', expired);
    return () => window.removeEventListener('auth-expired', expired);
  }, []);
  const logout = () => { setToken(null); setUser(null); };
  if (user === undefined) return <div className="empty">Loading…</div>;
  if (!user) return <Login onLogin={(res) => { setToken(res.token); setUser(res.user); }} />;
  return <AuthCtx.Provider value={{ user }}><Shell user={user} logout={logout} /></AuthCtx.Provider>;
}
