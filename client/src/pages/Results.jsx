import { useState, useEffect } from 'react';
import { post, qs } from '../api.js';
import { useAuth, useData, Page, Loading, ErrorBox, Badge, run, ClassPicker, SUBJECTS } from '../ui.jsx';

function FamilyResults() {
  const { student } = useAuth();
  const [rows, , { error }] = useData('/results');
  if (error) return <ErrorBox error={error} />;
  if (!rows) return <Loading />;
  const exams = {};
  rows.forEach(r => (exams[r.exam_name] ||= []).push(r));
  return (<Page title="Results" sub={`${student.name} · Class ${student.class}-${student.section}`} actions={<button className="btn secondary no-print" onClick={() => window.print()}>Print</button>}>
    {!rows.length && <div className="card empty">No results published yet.</div>}
    {Object.entries(exams).map(([exam, subs]) => {
      const tot = subs.reduce((a, r) => a + r.marks_obtained, 0), max = subs.reduce((a, r) => a + r.max_marks, 0), pct = Math.round(tot / max * 1000) / 10;
      return (<div className="card flush" key={exam}><div className="card-head"><h2 style={{ margin: 0 }}>{exam}</h2><div className="spacer" /><Badge tone={pct >= 33 ? 'ok' : 'bad'}>{`${pct}%`}</Badge></div>
        <div className="table-wrap"><table><thead><tr><th>Subject</th><th className="num">Marks</th><th className="num">Max</th><th className="num">%</th><th>Grade</th><th className="hide-sm">Remarks</th></tr></thead>
          <tbody>{subs.map(r => <tr key={r.id}><td>{r.subject}</td><td className="num">{r.marks_obtained}</td><td className="num">{r.max_marks}</td><td className="num">{r.percent}</td>
            <td><Badge tone={r.grade === 'E' ? 'bad' : r.grade.startsWith('A') ? 'ok' : 'info'}>{r.grade}</Badge></td><td className="hide-sm">{r.remarks || ''}</td></tr>)}</tbody>
          <tfoot><tr><td>Total</td><td className="num">{tot}</td><td className="num">{max}</td><td className="num">{pct}</td><td colSpan={2} /></tr></tfoot></table></div></div>);
    })}
    <div className="small muted">Grading (CBSE pattern): A1 91–100 · A2 81–90 · B1 71–80 · B2 61–70 · C1 51–60 · C2 41–50 · D 33–40 · E below 33</div>
  </Page>);
}

function StaffResults() {
  const [f, setF] = useState({ class: '10', section: 'A', exam_name: '', subject: '' });
  const [max, setMax] = useState(100);
  const [meta] = useData('/results');
  const ready = f.class && f.section && f.exam_name && f.subject;
  const [rows, reload] = useData(ready ? '/results' + qs(f) : null);
  const [marks, setMarks] = useState({});
  useEffect(() => {
    if (!Array.isArray(rows)) return;
    setMarks(Object.fromEntries(rows.map(r => [r.student_id, { marks_obtained: r.marks_obtained ?? '', remarks: r.remarks ?? '' }])));
    const m = rows.find(r => r.max_marks)?.max_marks; if (m) setMax(m);
  }, [rows]);
  const save = async () => {
    if (await run(() => post('/results', { ...f, max_marks: Number(max), records: Object.entries(marks).map(([student_id, v]) => ({ student_id: Number(student_id), ...v })) }), (r) => `Saved marks for ${r.saved} students`)) reload();
  };
  return (<Page title="Results" sub="Enter marks subject-wise for an exam. Students & parents see their report card instantly.">
    <div className="filters"><ClassPicker value={f} onChange={setF} />
      <input list="exams" placeholder="Exam name e.g. Unit Test 1" value={f.exam_name} onChange={(e) => setF({ ...f, exam_name: e.target.value })} />
      <datalist id="exams">{(meta?.exams || []).concat(['Unit Test 1', 'Unit Test 2', 'Half Yearly', 'Pre-Board', 'Annual Exam']).map(x => <option key={x} value={x} />)}</datalist>
      <select value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })}><option value="">Subject</option>{SUBJECTS.map(s => <option key={s}>{s}</option>)}</select>
      <label className="f">Max marks<input type="number" min="1" value={max} onChange={(e) => setMax(e.target.value)} /></label>
    </div>
    {!ready ? <div className="card empty">Choose class, section, exam and subject.</div> : !Array.isArray(rows) ? <Loading /> : <div className="card flush">
      <div className="table-wrap"><table><thead><tr><th>Roll</th><th>Student</th><th>Marks (out of {max})</th><th>Remarks</th></tr></thead><tbody>
        {rows.map(r => <tr key={r.student_id}><td>{r.roll_no}</td><td>{r.name}</td>
          <td><input type="number" min="0" max={max} step="0.5" style={{ maxWidth: 110 }} value={marks[r.student_id]?.marks_obtained ?? ''} onChange={(e) => setMarks({ ...marks, [r.student_id]: { ...marks[r.student_id], marks_obtained: e.target.value } })} /></td>
          <td><input value={marks[r.student_id]?.remarks ?? ''} onChange={(e) => setMarks({ ...marks, [r.student_id]: { ...marks[r.student_id], remarks: e.target.value } })} /></td></tr>)}
      </tbody></table>{!rows.length && <div className="empty">No students in this class.</div>}</div>
      <div className="card-head"><div className="spacer" /><button className="btn" onClick={save}>Save marks</button></div></div>}
  </Page>);
}

export default function Results() {
  const { user } = useAuth();
  return ['student', 'parent'].includes(user.role) ? <FamilyResults /> : <StaffResults />;
}
