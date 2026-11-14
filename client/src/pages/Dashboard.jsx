import { Link } from 'react-router-dom';
import { useAuth, useData, Page, Stat, Loading, ErrorBox, inr, fmtDate, Badge, monthLabel } from '../ui.jsx';

const NoticeList = ({ items, to }) => (<div className="card"><div className="row"><h2 style={{ margin: 0 }}>Latest notices</h2><div className="spacer" /><Link to={to} className="small">View all →</Link></div>
  {!items?.length ? <div className="muted small" style={{ marginTop: 8 }}>No notices.</div> : items.map(n => <div key={n.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
    <div className="row"><b>{n.title}</b><Badge tone="primary">{n.category}</Badge></div><div className="small muted">{fmtDate(n.notice_date)}</div></div>)}</div>);

export default function Dashboard() {
  const { user } = useAuth();
  const [d, , { error }] = useData('/dashboard');
  if (error) return <ErrorBox error={error} />;
  if (!d) return <Loading />;
  const hi = `Namaste, ${user.name.split(' ')[0]} 👋`;

  if (d.student) {
    const s = d.student;
    return (<Page title={hi} sub={`${user.role === 'parent' ? `Parent of ${s.name} · ` : ''}Class ${s.class}-${s.section} · Admission No. ${s.admission_no}`}>
      <div className="grid-stats">
        <Link to="/my-attendance"><Stat label="Attendance" value={d.attendancePct == null ? '—' : `${d.attendancePct}%`} icon="✅" tone={d.attendancePct < 75 ? 'bad' : 'ok'} /></Link>
        <Link to="/my-fees"><Stat label="Fee balance" value={inr(d.feeBalance)} icon="💳" tone={d.feeBalance > 0 ? 'warn' : 'ok'} /></Link>
        <Link to="/my-books"><Stat label="Books issued" value={d.booksIssued} icon="📖" /></Link>
        <Link to="/my-homework"><Stat label="Homework pending" value={d.homeworkDue.length} icon="📝" /></Link>
      </div>
      <div className="grid">
        <div className="card"><h2>Today's classes</h2>{!d.todayTimetable.length ? <div className="muted small">No classes today.</div> :
          d.todayTimetable.map(p => <div key={p.id} className="row" style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}><Badge>{`P${p.period}`}</Badge><b>{p.subject}</b><div className="spacer" /><span className="small muted">{p.start_time}–{p.end_time}</span></div>)}</div>
        <div className="card"><h2>Homework due</h2>{!d.homeworkDue.length ? <div className="muted small">All caught up!</div> :
          d.homeworkDue.map(h => <div key={h.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}><b>{h.subject}:</b> {h.title}<div className="small muted">Due {fmtDate(h.due_date)}</div></div>)}</div>
        <div className="card"><h2>Upcoming events</h2>{!d.events.length ? <div className="muted small">No upcoming events.</div> :
          d.events.map(e => <div key={e.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}><b>{e.title}</b><div className="small muted">{fmtDate(e.event_date)} · {e.venue}</div></div>)}</div>
      </div>
      <NoticeList items={d.notices} to="/my-notices" />
    </Page>);
  }

  const role = user.role, admin = role === 'admin';
  return (<Page title={hi} sub={new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}>
    {admin && <div className="card"><h2>Active user accounts</h2><div className="row">{d.users.map(u => <Badge key={u.role} tone="primary">{`${u.role}: ${u.count}`}</Badge>)}<div className="spacer" /><Link to="/users" className="btn sm">Manage users</Link></div></div>}
    <div className="grid-stats">
      {d.students != null && <><Link to="/students"><Stat label="Active students" value={d.students} icon="🎓" /></Link>
        <Link to="/attendance"><Stat label="Present today" value={`${d.presentToday} / ${d.markedToday || 0} marked`} icon="✅" /></Link>
        <Link to="/leaves"><Stat label="Pending leave requests" value={d.pendingLeaves} icon="✉️" tone={d.pendingLeaves ? 'warn' : undefined} /></Link></>}
      {d.feeCollected != null && <><Link to="/fees"><Stat label="Fees collected" value={inr(d.feeCollected)} icon="💰" tone="ok" /></Link>
        <Link to="/fees"><Stat label="Fees outstanding" value={inr(d.feeOutstanding)} icon="⏳" tone="warn" /></Link>
        <Stat label="Collected today" value={inr(d.feeToday)} icon="📅" />
        <Link to="/payroll"><Stat label="Active employees" value={d.employees} icon="🧾" /></Link>
        {d.lastPayroll && <Link to="/payroll"><Stat label={`Net payroll · ${monthLabel(d.lastPayroll.month)}`} value={inr(d.lastPayroll.net)} icon="💼" /></Link>}</>}
      {d.books != null && <><Link to="/library"><Stat label="Books in library" value={d.books} icon="📚" /></Link>
        <Link to="/library"><Stat label="Books issued" value={d.booksIssued} icon="📖" /></Link>
        <Link to="/library"><Stat label="Overdue returns" value={d.booksOverdue} icon="⚠️" tone={d.booksOverdue ? 'bad' : undefined} /></Link></>}
      {d.routes != null && (role === 'driver' ? <Link to="/drive"><Stat label={d.myRoute ? `Route ${d.myRoute.route_no} · ${d.myRoute.students} students` : 'No route set'} value={d.myRoute?.trip_active ? '🟢 Sharing live' : '⚪ Not sharing'} icon="🚌" /></Link>
        : <Link to="/bus-routes"><Stat label="Bus routes · live now" value={`${d.routes} · ${d.activeTrips}`} icon="🚌" /></Link>)}
    </div>
    <div className="grid">
      {d.upcomingEvents && <div className="card"><h2>Upcoming events</h2>{!d.upcomingEvents.length ? <div className="muted small">None.</div> :
        d.upcomingEvents.map(e => <div key={e.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}><b>{e.title}</b><div className="small muted">{fmtDate(e.event_date)} · {e.venue}</div></div>)}</div>}
      <NoticeList items={d.notices} to="/notices" />
    </div>
  </Page>);
}
