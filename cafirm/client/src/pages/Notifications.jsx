import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth, isStaff } from '../App.jsx';
import { Empty, ErrorMsg, Field, Loading, fmtDateTime, useLoad, Tabs } from '../ui.jsx';

/** Staff: compose a notification for one client, a type of institution, or everybody. */
export function SendMessage({ fixedClient, onSent }) {
  const clients = useLoad(() => (fixedClient ? Promise.resolve([]) : api.get('/clients?active=1')));
  const types = useLoad(() => api.get('/entity-types'));
  const [f, setF] = useState({ audience: fixedClient ? 'one' : 'one', client_id: fixedClient || '', entity_type: '', title: '', body: '' });
  const [err, setErr] = useState(''), [ok, setOk] = useState(''), [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setOk(''); setBusy(true);
    try {
      const body = { title: f.title, body: f.body };
      if (f.audience === 'one') body.client_ids = [Number(f.client_id)]; else if (f.audience === 'type') body.entity_type = f.entity_type; else body.all = true;
      const r = await api.post('/notifications/send', body);
      setOk(`Sent to ${r.people} person(s) in ${r.organisations} organisation(s).`); setF({ ...f, title: '', body: '' }); onSent?.(r);
    } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="form-grid">
      {!fixedClient && <Field label="Send to"><select value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value })}><option value="one">One client</option><option value="type">All clients of a type of institution</option><option value="all">All clients</option></select></Field>}
      {!fixedClient && f.audience === 'one' && <Field label="Client"><select value={f.client_id} onChange={(e) => setF({ ...f, client_id: e.target.value })} required><option value="">Choose…</option>{clients.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>}
      {f.audience === 'type' && <Field label="Type of institution"><select value={f.entity_type} onChange={(e) => setF({ ...f, entity_type: e.target.value })} required><option value="">Choose…</option>{types.data?.map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}</select></Field>}
      <Field label="Title" wide><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required maxLength={150} /></Field>
      <Field label="Message" wide><textarea value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
      <div className="wide"><ErrorMsg error={err} />{ok && <div className="alert ok">{ok}</div>}<button className="primary" disabled={busy}>{busy ? 'Sending…' : 'Send notification'}</button></div>
    </form>
  );
}

export function NotificationsPage() {
  const { user } = useAuth(), nav = useNavigate();
  const staff = isStaff(user);
  const [tab, setTab] = useState(staff ? 'send' : 'inbox');
  const inbox = useLoad(() => (staff ? Promise.resolve([]) : api.get('/notifications')), [staff]);
  const sent = useLoad(() => (staff ? api.get('/notifications/sent') : Promise.resolve([])), [staff, tab]);
  const open = async (n) => {
    if (!n.read_at) { await api.post(`/notifications/${n.id}/read`); inbox.reload(); window.dispatchEvent(new Event('notif-changed')); }
    if (n.filing_id) nav(`/filings?filing=${n.filing_id}`); else if (n.request_id) nav('/registrations');
  };
  const readAll = async () => { await api.post('/notifications/read-all'); inbox.reload(); window.dispatchEvent(new Event('notif-changed')); };

  if (!staff) return (
    <>
      <div className="page-head"><div><h1>Notifications</h1><p className="muted">Updates from your CA firm about your filings and registrations</p></div><button onClick={readAll}>Mark all as read</button></div>
      <Loading state={inbox} />
      {inbox.data && (inbox.data.length === 0 ? <Empty>No notifications yet.</Empty> : <div className="card" style={{ padding: 0 }}>{inbox.data.map((n) => (
        <div key={n.id} className={`notif ${n.read_at ? 'read' : 'unread'}`} onClick={() => open(n)}><span className="dot" />
          <div><b>{n.title}</b>{n.body && <div>{n.body}</div>}<div className="muted small">{fmtDateTime(n.created_at)}{n.from_name ? ` · ${n.from_name}` : ''}</div></div></div>))}</div>)}
    </>
  );
  return (
    <>
      <div className="page-head"><div><h1>Messages</h1><p className="muted">Notify customers about their filings and compliances</p></div></div>
      <Tabs tabs={[['send', 'New message'], ['sent', 'Sent']]} value={tab} onChange={setTab} />
      {tab === 'send' ? <div className="card"><SendMessage onSent={sent.reload} /></div> : (
        <><Loading state={sent} />{sent.data && (sent.data.length === 0 ? <Empty>Nothing sent yet.</Empty> :
          <table><thead><tr><th>Client</th><th>Message</th><th>Sent</th><th>Read</th></tr></thead><tbody>{sent.data.map((n) => (
            <tr key={n.id}><td data-label="Client">{n.client_name}</td><td data-label="Message"><b>{n.title}</b>{n.body && <div className="muted small">{n.body}</div>}</td>
              <td data-label="Sent">{fmtDateTime(n.created_at)}<div className="muted small">{n.from_name}</div></td><td data-label="Read">{n.read_count}/{n.recipients}</td></tr>))}</tbody></table>)}</>)}
    </>
  );
}
