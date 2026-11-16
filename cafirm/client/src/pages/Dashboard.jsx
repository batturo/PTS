import React from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth, isStaff } from '../App.jsx';
import { Badge, DueChip, Loading, fmtDate, fmtDateTime, useLoad, Empty } from '../ui.jsx';

const iso = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);

export default function Dashboard() {
  const { user } = useAuth(), staff = isStaff(user);
  const s = useLoad(() => api.get('/dashboard'));
  const d = s.data;
  return (
    <>
      <div className="page-head"><div><h1>Hello, {user.name.split(' ')[0]}</h1><p className="muted">{staff ? 'Firm overview' : user.client_name}</p></div></div>
      <Loading state={s} />
      {d && <>
        <div className="stats">
          <Link className="stat red" to="/filings?overdue=1"><b>{d.stats.overdue}</b><span>Overdue</span></Link>
          <Link className="stat amber" to={`/filings?open=1&from=${iso(0)}&to=${iso(30)}`}><b>{d.stats.due_soon}</b><span>Due in next 30 days</span></Link>
          <Link className="stat" to="/filings?open=1"><b>{d.stats.in_progress}</b><span>Being worked on</span></Link>
          {staff && <Link className="stat amber" to="/filings?status=awaiting_documents"><b>{d.stats.awaiting_documents}</b><span>Awaiting documents</span></Link>}
          <Link className="stat green" to="/filings?status=filed"><b>{d.stats.filed}</b><span>Filed</span></Link>
          <Link className="stat" to="/registrations"><b>{d.stats.open_registrations}</b><span>Open registrations</span></Link>
          {staff && <Link className="stat" to="/clients"><b>{d.stats.clients}</b><span>Active clients</span></Link>}
        </div>
        <h3>{staff ? 'Most urgent filings' : 'Your next compliances'}</h3>
        {d.upcoming.length === 0 ? <Empty>Nothing pending – you are all caught up.</Empty> : (
          <table><thead><tr>{staff && <th>Client</th>}<th>Compliance</th><th>Period</th><th>Due date</th><th>Status</th></tr></thead>
            <tbody>{d.upcoming.map((f) => (
              <tr key={f.id} className={f.overdue ? 'is-overdue' : ''}>
                {staff && <td data-label="Client"><Link to={`/clients/${f.client_id}`}>{f.client_name}</Link></td>}
                <td data-label="Compliance"><Link to={`/filings?filing=${f.id}`}><b>{f.name}</b></Link><div className="muted small">{f.category}</div></td>
                <td data-label="Period">{f.period_label}</td>
                <td data-label="Due" className="nowrap">{fmtDate(f.due_date)}<DueChip f={f} /></td>
                <td data-label="Status"><Badge status={f.status} /></td>
              </tr>))}</tbody></table>)}
        {staff && d.recent_activity && <><h3>Recent activity</h3><div className="card">{d.recent_activity.map((a, i) => <div key={i} className="small" style={{ padding: '4px 0' }}><b>{a.user_name || 'System'}</b> · {a.action.replace(/_/g, ' ')} {a.detail && <span className="muted">– {a.detail}</span>} <span className="muted">({fmtDateTime(a.at)})</span></div>)}</div></>}
      </>}
    </>
  );
}
