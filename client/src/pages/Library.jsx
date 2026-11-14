import { useState } from 'react';
import { post, put, del, qs } from '../api.js';
import { useData, Page, Modal, Field, Loading, ErrorBox, Badge, Stat, run, confirmDo, inr, fmtDate } from '../ui.jsx';

const GENRES = ['Fiction', 'Non-Fiction', 'Biography', 'History', 'Science', 'Mathematics', 'Textbook', 'Reference', 'Hindi Literature', 'English Literature', 'Poetry', 'Children', 'Comics', 'General Knowledge', 'Religion & Philosophy'];
const BOOK_FIELDS = [
  { name: 'title', label: 'Book name', required: true }, { name: 'author', label: "Author's name", required: true },
  { name: 'genre', label: 'Genre', type: 'select', options: GENRES }, { name: 'publisher', label: 'Publisher' }, { name: 'isbn', label: 'ISBN' },
  { name: 'accession_no', label: 'Accession no.', hint: 'Auto-generated if blank' }, { name: 'total_copies', label: 'Number of copies', type: 'number', min: 1, required: true },
  { name: 'cabinet_no', label: 'Cabinet no.' }, { name: 'shelf_no', label: 'Shelf no.' }, { name: 'row_no', label: 'Row' }, { name: 'column_no', label: 'Column' },
];
const place = (b) => [b.cabinet_no && `Cab ${b.cabinet_no}`, b.shelf_no && `Shelf ${b.shelf_no}`, b.row_no && `Row ${b.row_no}`, b.column_no && `Col ${b.column_no}`].filter(Boolean).join(' · ') || '—';

function Inventory() {
  const [f, setF] = useState({});
  const [rows, reload, { error }] = useData('/library/books' + qs(f));
  const [edit, setEdit] = useState(null);
  const [issue, setIssue] = useState(null);
  const save = async (e) => { e.preventDefault(); if (await run(() => edit.id ? put(`/library/books/${edit.id}`, edit) : post('/library/books', edit), edit.id ? 'Book updated' : 'Book added')) { setEdit(null); reload(); } };
  const remove = async (b) => { if (confirmDo(`Remove "${b.title}" from the library?`) && await run(() => del(`/library/books/${b.id}`), 'Book removed')) reload(); };
  const doIssue = async (e) => { e.preventDefault(); if (await run(() => post('/library/issue', issue), (r) => `Issued to ${r.student} – due ${fmtDate(r.due_date)}`)) { setIssue(null); reload(); } };
  return (<div className="stack">
    <div className="filters"><input placeholder="Search title, author, accession no., ISBN" value={f.q || ''} onChange={(e) => setF({ ...f, q: e.target.value })} style={{ maxWidth: 340, flexBasis: 260 }} />
      <select value={f.genre || ''} onChange={(e) => setF({ ...f, genre: e.target.value })}><option value="">All genres</option>{GENRES.map(g => <option key={g}>{g}</option>)}</select>
      <label className="row small" style={{ flex: 'none' }}><input type="checkbox" checked={f.available === '1'} onChange={(e) => setF({ ...f, available: e.target.checked ? '1' : '' })} /> Available only</label>
      <div className="spacer" /><button className="btn" style={{ flex: 'none' }} onClick={() => setEdit({ total_copies: 1 })}>＋ Add book</button></div>
    <ErrorBox error={error} />
    {!rows ? <Loading /> : <div className="card flush"><div className="table-wrap"><table>
      <thead><tr><th>Acc. no.</th><th>Book</th><th className="hide-sm">Genre</th><th>Placement</th><th className="num">Available</th><th /></tr></thead>
      <tbody>{rows.map(b => <tr key={b.id}><td>{b.accession_no}</td><td><b>{b.title}</b><div className="small muted">{b.author}</div></td><td className="hide-sm">{b.genre}</td><td className="small">{place(b)}</td>
        <td className="num"><Badge tone={b.available_copies ? 'ok' : 'bad'}>{`${b.available_copies} / ${b.total_copies}`}</Badge></td>
        <td className="nowrap right"><button className="btn sm ok" disabled={!b.available_copies} onClick={() => setIssue({ book_id: b.id, _b: b })}>Issue</button>{' '}
          <button className="btn sm secondary" onClick={() => setEdit(b)}>Edit</button>{' '}<button className="btn sm ghost" onClick={() => remove(b)} aria-label="Remove">🗑</button></td></tr>)}</tbody></table>
      {!rows.length && <div className="empty">No books found.</div>}</div></div>}
    {edit && <Modal wide title={edit.id ? 'Edit book' : 'Add book'} onClose={() => setEdit(null)} footer={<button className="btn" form="bf">Save</button>}>
      <form id="bf" className="form-grid" onSubmit={save}>{BOOK_FIELDS.map(x => <Field key={x.name} f={x} value={edit[x.name]} onChange={(k, v) => setEdit({ ...edit, [k]: v })} />)}</form></Modal>}
    {issue && <Modal title={`Issue "${issue._b.title}"`} onClose={() => setIssue(null)} footer={<button className="btn ok" form="if">Issue book</button>}>
      <form id="if" className="form-grid" onSubmit={doIssue}>
        <label className="f">Student admission no. *<input autoFocus value={issue.admission_no || ''} onChange={(e) => setIssue({ ...issue, admission_no: e.target.value })} required /></label>
        <label className="f">Issue for (days)<input type="number" min="1" placeholder="Default from settings" value={issue.days || ''} onChange={(e) => setIssue({ ...issue, days: e.target.value })} /></label>
      </form><div className="small muted" style={{ marginTop: 8 }}>Location: {place(issue._b)}</div></Modal>}
  </div>);
}

function Circulation() {
  const [f, setF] = useState({ status: 'Active' });
  const [rows, reload] = useData('/library/issues' + qs(f));
  const [sel, setSel] = useState([]);
  const act = async (path, msg) => { if (await run(() => post(path), msg)) reload(); };
  const ret = async (i) => {
    const waive = i.fine > 0 && confirmDo(`Fine due: ${inr(i.fine)}.\nOK = waive the fine, Cancel = record the fine.`);
    if (await run(() => post(`/library/return/${i.id}`, { waive }), (r) => `Returned${r.fine ? ` – fine ${inr(r.fine)} recorded` : ''}`)) reload();
  };
  const remind = async (body) => { const r = await run(() => post('/library/reminders', body), (r) => `Sent ${r.sent} reminder notice(s) to students & parents`); if (r) { setSel([]); reload(); } };
  return (<div className="stack">
    <div className="row"><div className="seg">{['Active', 'Overdue', 'Returned', 'All'].map(s => <button key={s} className={f.status === s ? 'on' : ''} onClick={() => { setF({ ...f, status: s }); setSel([]); }}>{s === 'Active' ? 'Currently issued' : s}</button>)}</div>
      <input style={{ maxWidth: 260 }} placeholder="Student / admission no. / book" value={f.q || ''} onChange={(e) => setF({ ...f, q: e.target.value })} /><div className="spacer" />
      <button className="btn sm secondary" onClick={() => remind({ scope: 'due_soon' })}>📢 Remind: due in 2 days</button>
      <button className="btn sm danger" onClick={() => remind({ scope: 'overdue' })}>📢 Notice to all overdue</button>
      {!!sel.length && <button className="btn sm" onClick={() => remind({ ids: sel })}>📢 Notice to {sel.length} selected</button>}</div>
    {!rows ? <Loading /> : <div className="card flush"><div className="table-wrap"><table>
      <thead><tr><th /><th>Book</th><th>Student</th><th>Issued</th><th>Due</th><th>Status</th><th className="num">Fine</th><th /></tr></thead>
      <tbody>{rows.map(i => <tr key={i.id}><td>{!i.return_date && <input type="checkbox" checked={sel.includes(i.id)} onChange={(e) => setSel(e.target.checked ? [...sel, i.id] : sel.filter(x => x !== i.id))} />}</td>
        <td><b>{i.title}</b><div className="small muted">{i.accession_no}</div></td><td>{i.student_name}<div className="small muted">{i.admission_no} · {i.class}-{i.section}</div></td>
        <td className="nowrap">{fmtDate(i.issue_date)}</td><td className="nowrap">{fmtDate(i.due_date)}{i.return_date && <div className="small muted">Returned {fmtDate(i.return_date)}</div>}{i.last_reminder && !i.return_date && <div className="small muted">Reminded {fmtDate(i.last_reminder)}</div>}</td>
        <td><Badge>{i.status}</Badge>{i.overdue_days > 0 && !i.return_date && <div className="small muted">{i.overdue_days} days late</div>}</td><td className="num">{i.fine ? inr(i.fine) : '—'}</td>
        <td className="nowrap right">{!i.return_date && <><button className="btn sm ok" onClick={() => ret(i)}>Return</button>{' '}<button className="btn sm secondary" onClick={() => act(`/library/renew/${i.id}`, 'Renewed')}>Renew</button></>}</td></tr>)}</tbody></table>
      {!rows.length && <div className="empty">Nothing here.</div>}</div></div>}
  </div>);
}

export default function Library() {
  const [tab, setTab] = useState(0);
  const [s] = useData('/library/stats', [tab]);
  return (<Page title="Library" sub="Book inventory, issue & return, overdue notices">
    {s && <div className="grid-stats"><Stat label="Titles" value={s.titles} icon="📚" /><Stat label="Total copies" value={s.copies} icon="📗" /><Stat label="On shelf" value={s.available} icon="✅" />
      <Stat label="Issued" value={s.issued} icon="📖" /><Stat label="Overdue" value={s.overdue} icon="⚠️" tone={s.overdue ? 'bad' : undefined} /></div>}
    <div className="tabs">{['Inventory', 'Issue / Return'].map((l, i) => <button key={l} className={tab === i ? 'on' : ''} onClick={() => setTab(i)}>{l}</button>)}</div>
    {tab === 0 ? <Inventory /> : <Circulation />}
  </Page>);
}
