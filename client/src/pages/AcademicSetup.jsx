import { useState } from 'react';
import { post, put, del } from '../api.js';
import { useAuth, Page, Modal, Field, Badge, run, confirmDo, fmtDate } from '../ui.jsx';

/** Administrator setup: classes & sections with class teachers, subject teachers, subjects and the year's exams. */
const teacherOptions = (structure) => structure.teachers.map(t => ({ value: t.id, label: `${t.name}${t.role === 'admin' ? ' (admin)' : ''}` }));

function TeacherSelect({ value, onChange, structure, placeholder = '— Not assigned —' }) {
  return (<select value={value ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)} aria-label="Teacher" style={{ minWidth: 170 }}>
    <option value="">{placeholder}</option>{teacherOptions(structure).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
  </select>);
}

function Classes() {
  const { structure, reloadStructure } = useAuth();
  const [add, setAdd] = useState(null);
  const [rename, setRename] = useState(null);
  const done = async (p, msg) => { if (await run(p, msg)) reloadStructure(); };
  return (<div className="stack">
    <div className="row"><div className="small muted">Add classes and their sections, then choose each section's class teacher. The class teacher manages that section's students, attendance, time table and leave requests.</div>
      <div className="spacer" /><button className="btn" onClick={() => setAdd({ name: '', sections: 'A' })}>＋ Add class</button></div>
    {!structure.classes.length && <div className="card empty">No classes yet. Click “Add class”.</div>}
    <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 400px), 1fr))' }}>{structure.classes.map(c => <div key={c.id} className="card flush">
      <div className="card-head"><b>Class {c.name}</b><Badge>{`${c.sections.reduce((a, s) => a + s.students, 0)} students`}</Badge><div className="spacer" />
        <button className="btn sm ghost" title="Rename / order" onClick={() => setRename({ kind: 'class', id: c.id, name: c.name, sort_order: c.sort_order })}>✎</button>
        <button className="btn sm ghost" aria-label="Delete class" onClick={() => confirmDo(`Delete class ${c.name} and its sections?`) && done(() => del(`/classes/${c.id}`), 'Class deleted')}>🗑</button></div>
      <table><thead><tr><th>Section</th><th>Class teacher</th><th className="num">Students</th><th /></tr></thead><tbody>
        {c.sections.map(s => <tr key={s.id}><td><b>{c.name}-{s.name}</b></td>
          <td><TeacherSelect value={s.class_teacher_id} structure={structure} onChange={(v) => done(() => put(`/sections/${s.id}`, { class_teacher_id: v }), v ? 'Class teacher assigned' : 'Class teacher removed')} /></td>
          <td className="num">{s.students}</td>
          <td className="nowrap right"><button className="btn sm ghost" title="Rename" onClick={() => setRename({ kind: 'section', id: s.id, name: s.name })}>✎</button>
            <button className="btn sm ghost" aria-label="Delete section" onClick={() => confirmDo(`Delete section ${c.name}-${s.name}?`) && done(() => del(`/sections/${s.id}`), 'Section deleted')}>🗑</button></td></tr>)}
      </tbody></table>
      <form className="card-head" onSubmit={(e) => { e.preventDefault(); const n = e.target.sec.value.trim(); if (n) done(() => post('/sections', { class_id: c.id, name: n }), `Section ${c.name}-${n} added`).then(() => { e.target.reset(); }); }}>
        <input name="sec" placeholder="New section, e.g. C" style={{ maxWidth: 180 }} aria-label="New section name" /><button className="btn sm secondary">＋ Add section</button></form>
    </div>)}</div>

    {add && <Modal title="Add class" onClose={() => setAdd(null)} footer={<button className="btn" form="addc">Add class</button>}>
      <form id="addc" className="form-grid" onSubmit={async (e) => { e.preventDefault(); if (await run(() => post('/classes', { name: add.name, sections: add.sections.split(',').map(x => x.trim()).filter(Boolean) }), `Class ${add.name} added`)) { setAdd(null); reloadStructure(); } }}>
        <label className="f">Class name *<input value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} placeholder="e.g. 6, 11, Nursery" required /></label>
        <label className="f">Sections<input value={add.sections} onChange={(e) => setAdd({ ...add, sections: e.target.value })} placeholder="A, B, C" /><span className="small" style={{ fontWeight: 400 }}>Separate with commas</span></label>
      </form></Modal>}
    {rename && <Modal title={rename.kind === 'class' ? 'Edit class' : 'Rename section'} onClose={() => setRename(null)} footer={<button className="btn" form="ren">Save</button>}>
      <form id="ren" className="form-grid" onSubmit={async (e) => { e.preventDefault(); const body = rename.kind === 'class' ? { name: rename.name, sort_order: rename.sort_order } : { name: rename.name };
        if (await run(() => put(`/${rename.kind === 'class' ? 'classes' : 'sections'}/${rename.id}`, body), 'Saved')) { setRename(null); reloadStructure(); } }}>
        <label className="f">Name *<input value={rename.name} onChange={(e) => setRename({ ...rename, name: e.target.value })} required /></label>
        {rename.kind === 'class' && <label className="f">Display order<input type="number" value={rename.sort_order} onChange={(e) => setRename({ ...rename, sort_order: e.target.value })} /></label>}
      </form><div className="small muted" style={{ marginTop: 8 }}>Renaming also updates students, fees and all class content that use this name.</div></Modal>}
  </div>);
}

function SubjectTeachers() {
  const { structure, reloadStructure } = useAuth();
  const sections = structure.classes.flatMap(c => c.sections.map(s => ({ ...s, class: c.name })));
  const [sel, setSel] = useState(sections[0]?.id || '');
  const [row, setRow] = useState({ subject: '', teacher_id: null });
  const section = sections.find(s => s.id === Number(sel));
  const rows = structure.allotments.filter(a => a.section_id === Number(sel));
  const free = structure.subjects.filter(s => !rows.some(r => r.subject === s.name));
  const save = async (subject, teacher_id, msg) => { if (await run(() => post('/allotments', { section_id: Number(sel), subject, teacher_id }), msg)) reloadStructure(); };
  return (<div className="stack">
    <div className="row"><select style={{ maxWidth: 220 }} value={sel} onChange={(e) => setSel(e.target.value)} aria-label="Section">
      {sections.map(s => <option key={s.id} value={s.id}>Class {s.class}-{s.name}</option>)}</select>
      {section && <span className="small muted">Class teacher: <b>{section.class_teacher_name || 'not assigned'}</b></span>}</div>
    {!section ? <div className="card empty">Add classes and sections first.</div> : <div className="card flush">
      <div className="table-wrap"><table><thead><tr><th>Subject</th><th>Subject teacher</th><th /></tr></thead><tbody>
        {rows.map(a => <tr key={a.id}><td><b>{a.subject}</b></td>
          <td><TeacherSelect value={a.teacher_id} structure={structure} onChange={(v) => save(a.subject, v, 'Subject teacher updated')} /></td>
          <td className="right"><button className="btn sm ghost" aria-label={`Remove ${a.subject}`} onClick={async () => { if (confirmDo(`Remove ${a.subject} from ${section.class}-${section.name}?`) && await run(() => del(`/allotments/${a.id}`), 'Removed')) reloadStructure(); }}>🗑</button></td></tr>)}
      </tbody></table>{!rows.length && <div className="empty">No subjects allotted to {section.class}-{section.name} yet.</div>}</div>
      <form className="card-head" onSubmit={(e) => { e.preventDefault(); if (row.subject) save(row.subject, row.teacher_id, `${row.subject} allotted`).then(() => setRow({ subject: '', teacher_id: null })); }}>
        <select style={{ maxWidth: 220 }} value={row.subject} onChange={(e) => setRow({ ...row, subject: e.target.value })} required aria-label="Subject">
          <option value="">Add subject…</option>{free.map(s => <option key={s.id}>{s.name}</option>)}</select>
        <div style={{ maxWidth: 260, flex: 1 }}><TeacherSelect value={row.teacher_id} structure={structure} placeholder="Teacher (optional)" onChange={(v) => setRow({ ...row, teacher_id: v })} /></div>
        <button className="btn sm">＋ Allot</button></form>
    </div>}
  </div>);
}

function ByTeacher() {
  const { structure, reloadStructure } = useAuth();
  const [f, setF] = useState(null);
  const teachers = structure.teachers.filter(t => t.role === 'teacher');
  const sections = structure.classes.flatMap(c => c.sections.map(s => ({ ...s, class: c.name })));
  return (<div className="stack">
    <div className="small muted">Every teacher with the classes they are class teacher of and the subjects allotted to them. Teachers can change information only for these.</div>
    <div className="grid">{teachers.map(t => {
      const ct = sections.filter(s => s.class_teacher_id === t.id);
      const subs = structure.allotments.filter(a => a.teacher_id === t.id);
      return (<div key={t.id} className="card stack">
        <div className="row"><div className="avatar">{t.name[0]}</div><div><b>{t.name}</b><div className="small muted">{t.username}</div></div><div className="spacer" />
          <button className="btn sm secondary" onClick={() => setF({ teacher_id: t.id, name: t.name, section_id: '', subject: '' })}>＋ Allot</button></div>
        <div className="small"><b>Class teacher of:</b> {ct.length ? ct.map(s => <Badge key={s.id} tone="primary">{`${s.class}-${s.name}`}</Badge>) : <span className="muted">—</span>}</div>
        <div className="small"><b>Subjects:</b>{!subs.length && <span className="muted"> none allotted</span>}
          <div className="row" style={{ marginTop: 6, gap: 6 }}>{subs.map(a => <span key={a.id} className="badge info">{a.subject} · {a.class}-{a.section}
            <button className="btn ghost" style={{ minHeight: 0, padding: '0 0 0 6px', color: 'inherit' }} aria-label={`Remove ${a.subject} ${a.class}-${a.section}`}
              onClick={async () => { if (confirmDo(`Remove ${a.subject} (${a.class}-${a.section}) from ${t.name}?`) && await run(() => del(`/allotments/${a.id}`), 'Removed')) reloadStructure(); }}>✕</button></span>)}</div></div>
      </div>);
    })}</div>
    {!teachers.length && <div className="card empty">No teacher accounts yet. Create them under User Accounts.</div>}
    {f && <Modal title={`Allot to ${f.name}`} onClose={() => setF(null)} footer={<button className="btn" form="allot">Allot</button>}>
      <form id="allot" className="form-grid" onSubmit={async (e) => { e.preventDefault();
        if (await run(() => post('/allotments', { section_id: Number(f.section_id), subject: f.subject, teacher_id: f.teacher_id }), `${f.subject} allotted to ${f.name}`)) { setF(null); reloadStructure(); } }}>
        <label className="f">Class & section *<select value={f.section_id} onChange={(e) => setF({ ...f, section_id: e.target.value })} required><option value="">— Select —</option>
          {sections.map(s => <option key={s.id} value={s.id}>Class {s.class}-{s.name}</option>)}</select></label>
        <label className="f">Subject *<select value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} required><option value="">— Select —</option>
          {structure.subjects.map(s => <option key={s.id}>{s.name}</option>)}</select></label>
      </form>
      {f.section_id && f.subject && (() => { const cur = structure.allotments.find(a => a.section_id === Number(f.section_id) && a.subject === f.subject);
        return cur?.teacher_id && cur.teacher_id !== f.teacher_id ? <div className="alert info" style={{ marginTop: 10 }}>This replaces {cur.teacher_name} as the {f.subject} teacher of {cur.class}-{cur.section}.</div> : null; })()}
    </Modal>}
  </div>);
}

function Subjects() {
  const { structure, reloadStructure } = useAuth();
  const [n, setN] = useState('');
  return (<div className="stack" style={{ maxWidth: 560 }}>
    <form className="row" onSubmit={async (e) => { e.preventDefault(); if (await run(() => post('/subjects', { name: n }), `${n} added`)) { setN(''); reloadStructure(); } }}>
      <input value={n} onChange={(e) => setN(e.target.value)} placeholder="New subject, e.g. Artificial Intelligence" required style={{ flex: 1 }} aria-label="New subject" /><button className="btn">＋ Add subject</button></form>
    <div className="card flush"><table><tbody>{structure.subjects.map(s => <tr key={s.id}><td>{s.name}</td>
      <td className="right"><button className="btn sm ghost" aria-label={`Delete ${s.name}`} onClick={async () => { if (confirmDo(`Delete ${s.name}?`) && await run(() => del(`/subjects/${s.id}`), 'Deleted')) reloadStructure(); }}>🗑</button></td></tr>)}</tbody></table></div>
  </div>);
}

const EXAM_FIELDS = [{ name: 'name', label: 'Exam name', required: true, placeholder: 'e.g. Unit Test 1, Half Yearly, Annual' },
  { name: 'start_date', label: 'Starts', type: 'date' }, { name: 'end_date', label: 'Ends', type: 'date' },
  { name: 'max_marks', label: 'Default maximum marks', type: 'number', min: 1, hint: 'Teachers can still change it per subject' },
  { name: 'sort_order', label: 'Order in the year', type: 'number' }];
function Exams() {
  const { structure, reloadStructure } = useAuth();
  const [edit, setEdit] = useState(null);
  const save = async (e) => { e.preventDefault(); const { id, ...b } = edit;
    if (await run(() => id ? put(`/exams/${id}`, b) : post('/exams', b), id ? 'Exam updated' : 'Exam added')) { setEdit(null); reloadStructure(); } };
  return (<div className="stack">
    <div className="row"><div className="small muted">The exams held this academic year. Teachers prepare date sheets and enter results only for these exams.</div><div className="spacer" />
      <button className="btn" onClick={() => setEdit({ max_marks: 100 })}>＋ Add exam</button></div>
    <div className="card flush"><div className="table-wrap"><table><thead><tr><th>#</th><th>Exam</th><th>Dates</th><th className="num">Max marks</th><th /></tr></thead><tbody>
      {structure.exams.map(x => <tr key={x.id}><td>{x.sort_order}</td><td><b>{x.name}</b></td><td className="nowrap">{x.start_date ? `${fmtDate(x.start_date)} – ${fmtDate(x.end_date)}` : <span className="muted">Not set</span>}</td>
        <td className="num">{x.max_marks}</td><td className="nowrap right"><button className="btn sm secondary" onClick={() => setEdit(x)}>Edit</button>{' '}
          <button className="btn sm ghost" aria-label={`Delete ${x.name}`} onClick={async () => { if (confirmDo(`Delete ${x.name}?`) && await run(() => del(`/exams/${x.id}`), 'Deleted')) reloadStructure(); }}>🗑</button></td></tr>)}
    </tbody></table>{!structure.exams.length && <div className="empty">No exams added yet.</div>}</div></div>
    {edit && <Modal title={edit.id ? `Edit ${edit.name}` : 'Add exam'} onClose={() => setEdit(null)} footer={<button className="btn" form="exf">Save</button>}>
      <form id="exf" className="form-grid" onSubmit={save}>{EXAM_FIELDS.map(f => <Field key={f.name} f={f} value={edit[f.name]} onChange={(k, v) => setEdit({ ...edit, [k]: v })} />)}</form>
      {edit.id && <div className="small muted" style={{ marginTop: 8 }}>Renaming an exam also renames it in date sheets and results.</div>}</Modal>}
  </div>);
}

const TABS = [['Classes & Sections', Classes], ['Subject Teachers', SubjectTeachers], ['By Teacher', ByTeacher], ['Subjects', Subjects]];
export default function AcademicSetup({ tab }) {
  const [i, setI] = useState(0);
  if (tab === 'exams') return <Page title="Exams of the Year" sub="Add every exam held this year (unit tests, half yearly, pre-boards, annual…)"><Exams /></Page>;
  const Comp = TABS[i][1];
  return (<Page title="Classes & Teachers" sub="Create classes and sections, choose class teachers and allot subjects to teachers">
    <div className="tabs">{TABS.map(([l], k) => <button key={l} className={i === k ? 'on' : ''} onClick={() => setI(k)}>{l}</button>)}</div>
    <Comp />
  </Page>);
}
