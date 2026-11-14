import { useData, Page, Loading, Badge, inr, fmtDate } from '../ui.jsx';
export default function MyBooks() {
  const [rows] = useData('/library/my');
  const active = (rows || []).filter(r => !r.return_date);
  return (<Page title="Books Issued" sub="Books issued to you by the school library.">
    {!rows ? <Loading /> : <>
      {active.some(r => r.status === 'Overdue') && <div className="alert">You have overdue books. Please return them to the library to stop the fine from increasing.</div>}
      <div className="card flush"><div className="card-head"><b>Currently with you ({active.length})</b></div><div className="table-wrap"><table>
        <thead><tr><th>Book</th><th>Issued on</th><th>Return by</th><th>Status</th><th className="num">Fine</th></tr></thead>
        <tbody>{active.map(r => <tr key={r.id}><td><b>{r.title}</b><div className="small muted">{r.author}</div></td><td>{fmtDate(r.issue_date)}</td><td>{fmtDate(r.due_date)}</td><td><Badge>{r.status}</Badge></td><td className="num">{r.fine ? inr(r.fine) : '—'}</td></tr>)}</tbody></table>
        {!active.length && <div className="empty">No books issued right now.</div>}</div></div>
      <div className="card flush"><div className="card-head"><b>History</b></div><div className="table-wrap"><table><tbody>
        {rows.filter(r => r.return_date).map(r => <tr key={r.id}><td>{r.title}</td><td>{fmtDate(r.issue_date)} → {fmtDate(r.return_date)}</td><td className="num">{r.fine ? `Fine ${inr(r.fine)}` : ''}</td></tr>)}</tbody></table>
        {!rows.some(r => r.return_date) && <div className="empty">No returned books yet.</div>}</div></div></>}
  </Page>);
}
