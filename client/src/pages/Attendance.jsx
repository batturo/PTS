import { useState, useEffect } from 'react';
import { post, qs } from '../api.js';
import { useAuth, useAccess, useData, Page, Loading, ErrorBox, Badge, Stat, run, ClassPicker, todayISO, thisMonth, fmtDate } from '../ui.jsx';

const ST = [['P', 'Present'], ['A', 'Absent'], ['L', 'Leave'], ['H', 'Holiday']];

function FamilyAttendance() {
  const [d, , { error }] = useData('/attendance');
  if (error) return <ErrorBox error={error} />;
  if (!d) return <Loading />;
  const s = d.summary;
  const byMonth = {};
  d.records.forEach(r => (byMonth[r.date.slice(0, 7)] ||= []).push(r));
  return (<Page title="Attendance" sub="Attendance marked daily by the class teacher.">
    <div className="grid-stats">
      <Stat label="Attendance" value={s.percent == null ? '—' : `${s.percent}%`} icon="📈" tone={s.percent < 75 ? 'bad' : 'ok'} />
      <Stat label="Days present" value={s.present} icon="✅" /><Stat label="Days absent" value={s.absent} icon="❌" /><Stat label="On leave" value={s.leave} icon="✉️" />
    </div>
    {s.percent != null && s.percent < 75 && <div className="alert">Attendance is below the 75% required to appear in board examinations.</div>}
    {Object.entries(byMonth).map(([m, recs]) => <div className="card" key={m}><h2>{new Date(m + '-01').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</h2>
      <div className="row">{recs.slice().reverse().map(r => <div key={r.date} title={fmtDate(r.date)} style={{ textAlign: 'center', width: 44 }}>
        <div className="small muted">{Number(r.date.slice(8))}</div><Badge>{r.status}</Badge></div>)}</div></div>)}
    {!d.records.length && <div className="card empty">No attendance recorded yet.</div>}
    <div className="small muted">P = Present · A = Absent · L = Leave · H = Holiday</div>
  </Page>);
}

function StaffAttendance() {
  const acc = useAccess();
  const [tab, setTab] = useState('mark');
  const first = acc.classTeacher[0] || acc.linked[0] || {};
  const [cls, setCls] = useState({ class: first.class || '', section: first.section || '' });
  const canMark = cls.class && cls.section && acc.isClassTeacher(cls.class, cls.section);
  const [date, setDate] = useState(todayISO());
  const [month, setMonth] = useState(thisMonth());
  const ready = cls.class && cls.section;
  const [rows, reload, { error }] = useData(ready && tab === 'mark' ? '/attendance' + qs({ ...cls, date }) : null);
  const [report] = useData(ready && tab === 'report' ? '/attendance/report' + qs({ ...cls, month }) : null);
  const [marks, setMarks] = useState({});
  useEffect(() => { if (rows) setMarks(Object.fromEntries(rows.map(r => [r.student_id, r.status || '']))); }, [rows]);

  const save = async () => {
    if (await run(() => post('/attendance', { date, class: cls.class, section: cls.section, records: Object.entries(marks).map(([student_id, status]) => ({ student_id: Number(student_id), status })) }), (r) => `Attendance saved for ${r.saved} students`)) reload();
  };
  const all = (s) => setMarks(Object.fromEntries(Object.keys(marks).map(k => [k, s])));
  const count = (s) => Object.values(marks).filter(v => v === s).length;

  if (!acc.admin && !acc.linked.length) return <Page title="Attendance"><div className="card empty">No classes are allotted to you yet. Ask an administrator.</div></Page>;
  return (<Page title="Attendance" sub={acc.admin ? 'Mark daily attendance for a class.' : 'Class teachers mark attendance for their own class.'}>
    <div className="tabs"><button className={tab === 'mark' ? 'on' : ''} onClick={() => setTab('mark')}>Mark attendance</button><button className={tab === 'report' ? 'on' : ''} onClick={() => setTab('report')}>Monthly report</button></div>
    <div className="filters"><ClassPicker value={cls} onChange={setCls} only={acc.admin ? undefined : acc.linked} />
      {tab === 'mark' ? <input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} /> : <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />}</div>
    <ErrorBox error={error} />
    {!ready ? <div className="card empty">Choose a class and section.</div> : tab === 'mark' ? (!rows ? <Loading /> : <div className="card flush">
      <div className="card-head"><b>{fmtDate(date)}</b><Badge tone="ok">{`P ${count('P')}`}</Badge><Badge tone="bad">{`A ${count('A')}`}</Badge><Badge tone="warn">{`L ${count('L')}`}</Badge>
        <div className="spacer" />{canMark ? <><button className="btn sm secondary" onClick={() => all('P')}>All present</button><button className="btn sm secondary" onClick={() => all('H')}>Holiday</button></>
          : <span className="small muted">View only – only the class teacher of {cls.class}-{cls.section} can mark attendance</span>}</div>
      <div className="table-wrap"><table><thead><tr><th>Roll</th><th>Student</th><th>Status</th></tr></thead><tbody>
        {rows.map(r => <tr key={r.student_id}><td>{r.roll_no}</td><td>{r.name}<div className="small muted">{r.admission_no}</div></td>
          <td>{canMark ? <div className="seg">{ST.map(([v, l]) => <button key={v} className={marks[r.student_id] === v ? 'on' : ''} onClick={() => setMarks({ ...marks, [r.student_id]: v })} title={l}>{v}</button>)}</div>
            : marks[r.student_id] ? <Badge>{marks[r.student_id]}</Badge> : <span className="muted">—</span>}</td></tr>)}
      </tbody></table>{!rows.length && <div className="empty">No students in this class.</div>}</div>
      {!!rows.length && canMark && <div className="card-head"><div className="spacer" /><button className="btn" onClick={save}>Save attendance</button></div>}
    </div>) : (!report ? <Loading /> : <div className="card flush"><div className="table-wrap"><table>
      <thead><tr><th>Roll</th><th>Student</th><th className="num">Present</th><th className="num">Absent</th><th className="num">Leave</th><th className="num">%</th></tr></thead>
      <tbody>{report.map(r => { const pct = r.working ? Math.round(r.present / r.working * 100) : null; return <tr key={r.id}><td>{r.roll_no}</td><td>{r.name}</td>
        <td className="num">{r.present || 0}</td><td className="num">{r.absent || 0}</td><td className="num">{r.leave || 0}</td>
        <td className="num">{pct == null ? '—' : <Badge tone={pct < 75 ? 'bad' : 'ok'}>{`${pct}%`}</Badge>}</td></tr>; })}</tbody></table></div></div>)}
  </Page>);
}

export default function Attendance() {
  const { user } = useAuth();
  return ['student', 'parent'].includes(user.role) ? <FamilyAttendance /> : <StaffAttendance />;
}
