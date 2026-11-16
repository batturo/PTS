import React, { useState } from 'react';
import { api } from '../api.js';
import { Empty, Loading, ROLE_LABEL, fmtDateTime, useLoad } from '../ui.jsx';

export default function AuditPage() {
  const [q, setQ] = useState('');
  const s = useLoad(() => api.get(`/audit?${new URLSearchParams(q ? { q } : {})}`), [q]);
  return (
    <>
      <div className="page-head"><div><h1>Activity log</h1><p className="muted">Who changed or downloaded what, and when</p></div></div>
      <div className="filters"><input className="grow" placeholder="Search activity" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <Loading state={s} />
      {s.data && (s.data.length === 0 ? <Empty>No activity.</Empty> : <table><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Details</th></tr></thead><tbody>{s.data.map((a) => (
        <tr key={a.id}><td data-label="When" className="nowrap">{fmtDateTime(a.at)}</td><td data-label="Who">{a.user_name || '–'}<div className="muted small">{ROLE_LABEL[a.user_role]}</div></td><td data-label="Action">{a.action.replace(/_/g, ' ')}</td><td data-label="Details">{a.detail}</td></tr>))}</tbody></table>)}
    </>
  );
}
