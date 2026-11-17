import { useState } from 'react';
import { post, put, del, qs } from '../api.js';
import { useAuth, useAccess, useData, Page, Loading, Modal, Field, run, ClassPicker, DAYS, confirmDo } from '../ui.jsx';

function Grid({ rows, onCell }) {
  const periods = [...new Set(rows.map(r => r.period))].sort((a, b) => a - b);
  if (!onCell && !rows.length) return <div className="card empty">Time table not published yet.</div>;
  const maxP = Math.max(8, ...periods);
  const cols = onCell ? Array.from({ length: maxP }, (_, i) => i + 1) : periods;
  return (<div className="card flush"><div className="table-wrap"><table className="tt">
    <thead><tr><th>Day</th>{cols.map(p => <th key={p} style={{ textAlign: 'center' }}>Period {p}</th>)}</tr></thead>
    <tbody>{DAYS.map(d => <tr key={d}><th>{d.slice(0, 3)}</th>{cols.map(p => {
      const c = rows.find(r => r.day === d && r.period === p);
      return <td key={p} onClick={onCell ? () => onCell(c || { day: d, period: p }) : undefined} style={onCell ? { cursor: 'pointer' } : null}>
        {c ? <><b>{c.subject}</b><small>{c.start_time}–{c.end_time}</small>{c.teacher_name && <div><small>{c.teacher_name}</small></div>}</> : onCell ? <span className="muted">＋</span> : '—'}</td>;
    })}</tr>)}</tbody></table></div></div>);
}

export default function Timetable() {
  const { user, student, structure } = useAuth();
  const acc = useAccess();
  const family = ['student', 'parent'].includes(user.role);
  const first = acc.classTeacher[0] || acc.linked[0] || {};
  const [cls, setCls] = useState({ class: first.class || '', section: first.section || '' });
  const canEdit = !family && cls.class && cls.section && acc.isClassTeacher(cls.class, cls.section);
  // subjects of this section and who teaches them (from the administrator's allotments)
  const allotted = (structure?.allotments || []).filter(a => a.class === cls.class && a.section === cls.section);
  const subjectOptions = allotted.length ? allotted.map(a => a.subject) : acc.allSubjects;
  const ready = family || (cls.class && cls.section);
  const [rows, reload] = useData(ready ? '/timetable' + (family ? '' : qs(cls)) : null);
  const [edit, setEdit] = useState(null);
  const save = async (e) => { e.preventDefault(); const b = { ...edit, ...cls }; if (await run(() => edit.id ? put(`/timetable/${edit.id}`, b) : post('/timetable', b), 'Saved')) { setEdit(null); reload(); } };
  const remove = async () => { if (confirmDo('Remove this period?') && await run(() => del(`/timetable/${edit.id}`), 'Removed')) { setEdit(null); reload(); } };

  if (family) return <Page title="Time Table" sub={`Class ${student.class}-${student.section}`}>{!rows ? <Loading /> : <Grid rows={rows} />}</Page>;
  return (<Page title="Time Table" sub={canEdit ? 'Click a cell to set the subject for that period.' : 'Only the class teacher (or an administrator) can change a class time table.'}>
    <div className="filters"><ClassPicker value={cls} onChange={setCls} only={acc.admin ? undefined : acc.linked} /></div>
    {!ready ? <div className="card empty">Choose a class and section.</div> : !rows ? <Loading /> : <Grid rows={rows} onCell={canEdit ? (c) => setEdit({ start_time: '', end_time: '', ...c }) : undefined} />}
    {edit && <Modal title={`${edit.day} · Period ${edit.period}`} onClose={() => setEdit(null)}
      footer={<>{edit.id && <button className="btn danger" onClick={remove}>Remove</button>}<div className="spacer" /><button className="btn" form="ttf">Save</button></>}>
      <form id="ttf" className="form-grid" onSubmit={save}>
        {[{ name: 'subject', label: 'Subject', type: 'select', options: subjectOptions, required: true }, { name: 'teacher_name', label: 'Teacher', hint: 'Filled in from the subject allotment' },
          { name: 'start_time', label: 'Starts', type: 'time' }, { name: 'end_time', label: 'Ends', type: 'time' }]
          .map(f => <Field key={f.name} f={f} value={edit[f.name]} onChange={(k, v) => setEdit({ ...edit, [k]: v,
            ...(k === 'subject' ? { teacher_name: allotted.find(a => a.subject === v)?.teacher_name || edit.teacher_name || '' } : {}) })} />)}
      </form></Modal>}
  </Page>);
}
