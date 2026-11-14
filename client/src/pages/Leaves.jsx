import { useState } from 'react';
import { post, put, del, qs } from '../api.js';
import { useAuth, useData, Page, Loading, ErrorBox, Badge, run, confirmDo, fmtDate, todayISO, Modal } from '../ui.jsx';

function FamilyLeaves() {
  const { student } = useAuth();
  const [rows, reload, { error }] = useData('/leaves');
  const [f, setF] = useState({ from_date: todayISO(), to_date: todayISO(), reason: '' });
  const submit = async (e) => { e.preventDefault(); if (await run(() => post('/leaves', f), 'Leave application submitted to the class teacher')) { setF({ ...f, reason: '' }); reload(); } };
  return (<Page title="Apply for Leave" sub={`For ${student.name}, Class ${student.class}-${student.section}`}>
    <form className="card form-grid" onSubmit={submit}>
      <label className="f">From<input type="date" value={f.from_date} onChange={(e) => setF({ ...f, from_date: e.target.value })} required /></label>
      <label className="f">To<input type="date" value={f.to_date} min={f.from_date} onChange={(e) => setF({ ...f, to_date: e.target.value })} required /></label>
      <label className="f full">Reason<textarea value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} required placeholder="e.g. Suffering from viral fever, doctor advised rest" /></label>
      <div><button className="btn">Submit application</button></div>
    </form>
    <ErrorBox error={error} />
    <h2>My applications</h2>
    {!rows ? <Loading /> : !rows.length ? <div className="card empty">No leave applications yet.</div> : rows.map(l => <div key={l.id} className="card feed-item">
      <div className="meta"><Badge>{l.status}</Badge><span>{fmtDate(l.from_date)} → {fmtDate(l.to_date)}</span><span>Applied {fmtDate(l.created_at)}</span>
        <div className="spacer" />{l.status === 'Pending' && <button className="btn sm ghost" onClick={async () => { if (confirmDo('Withdraw this application?') && await run(() => del(`/leaves/${l.id}`), 'Withdrawn')) reload(); }}>Withdraw</button>}</div>
      <p>{l.reason}</p>{l.reviewer_remark && <p className="small"><b>Teacher's remark:</b> {l.reviewer_remark}</p>}</div>)}
  </Page>);
}

function StaffLeaves() {
  const [status, setStatus] = useState('Pending');
  const [rows, reload, { error }] = useData('/leaves' + qs({ status }));
  const [review, setReview] = useState(null);
  const decide = async (s) => { if (await run(() => put(`/leaves/${review.id}`, { status: s, reviewer_remark: review.reviewer_remark }), `Leave ${s.toLowerCase()}`)) { setReview(null); reload(); } };
  return (<Page title="Leave Requests" sub="Applications from students and parents. Approved leave is marked as 'L' in attendance automatically.">
    <div className="seg">{['Pending', 'Approved', 'Rejected', ''].map(s => <button key={s} className={status === s ? 'on' : ''} onClick={() => setStatus(s)}>{s || 'All'}</button>)}</div>
    <ErrorBox error={error} />
    {!rows ? <Loading /> : <div className="card flush"><div className="table-wrap"><table>
      <thead><tr><th>Student</th><th>Dates</th><th>Reason</th><th>Status</th><th /></tr></thead>
      <tbody>{rows.map(l => <tr key={l.id}><td><b>{l.student_name}</b><div className="small muted">{l.class}-{l.section} · by {l.applied_by_role || '—'}</div></td>
        <td className="nowrap">{fmtDate(l.from_date)}<div className="small muted">to {fmtDate(l.to_date)}</div></td><td>{l.reason}</td><td><Badge>{l.status}</Badge></td>
        <td className="right"><button className="btn sm secondary" onClick={() => setReview({ ...l })}>Review</button></td></tr>)}</tbody></table>
      {!rows.length && <div className="empty">No {status.toLowerCase()} applications.</div>}</div></div>}
    {review && <Modal title={`Leave – ${review.student_name}`} onClose={() => setReview(null)}
      footer={<><button className="btn danger" onClick={() => decide('Rejected')}>Reject</button><button className="btn ok" onClick={() => decide('Approved')}>Approve</button></>}>
      <p><b>{fmtDate(review.from_date)} → {fmtDate(review.to_date)}</b></p><p>{review.reason}</p>
      <label className="f">Remark (optional)<textarea value={review.reviewer_remark || ''} onChange={(e) => setReview({ ...review, reviewer_remark: e.target.value })} /></label>
    </Modal>}
  </Page>);
}
export default function Leaves() { const { user } = useAuth(); return ['student', 'parent'].includes(user.role) ? <FamilyLeaves /> : <StaffLeaves />; }
