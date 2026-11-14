import { useState } from 'react';
import { post, put, del, qs, fileUrl, uploadFile } from '../api.js';
import { useData, Page, Modal, Field, Loading, ErrorBox, Badge, run, confirmDo, ClassPicker, CLASSES, SECTIONS, useAuth } from '../ui.jsx';
import { CredentialBox } from './Users.jsx';
import { IdCard } from './Profile.jsx';

const FIELDS = (isNew, routes) => [
  { name: 'admission_no', label: 'Admission number', required: true, hint: isNew ? 'Becomes the student login. Parent login = "P" + admission no.' : 'Cannot be changed' },
  { name: 'name', label: 'Student name', required: true }, { name: 'father_name', label: "Father's name" }, { name: 'mother_name', label: "Mother's name" },
  { name: 'dob', label: 'Date of birth', type: 'date' }, { name: 'gender', label: 'Gender', type: 'select', options: ['M', 'F', 'Other'].map(v => ({ value: v, label: { M: 'Male', F: 'Female', Other: 'Other' }[v] })) },
  { name: 'class', label: 'Class', type: 'select', options: CLASSES, required: true }, { name: 'section', label: 'Section', type: 'select', options: SECTIONS, required: true },
  { name: 'roll_no', label: 'Roll number' }, { name: 'mobile', label: 'Mobile number', type: 'tel' }, { name: 'email', label: 'Email', type: 'email' },
  { name: 'blood_group', label: 'Blood group', type: 'select', options: ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'] },
  { name: 'route_no', label: 'Bus route', type: 'select', options: () => routes.map(r => ({ value: r.route_no, label: `${r.route_no} – ${r.route_name || ''}` })), placeholder: 'No school transport' },
  { name: 'concession_pct', label: 'Fee concession (%)', type: 'number', min: 0, max: 100, hint: 'Sibling / staff-ward / scholarship' },
  { name: 'photo_url', label: 'Photo', render: (v, set) => <div className="row">{v && <img src={fileUrl(v)} alt="" width="40" height="40" style={{ borderRadius: 8, objectFit: 'cover' }} />}
      <input type="file" accept="image/*" onChange={async (e) => { const f = e.target.files[0]; if (f) { const r = await run(() => uploadFile(f)); if (r) set(r.url); } }} /></div> },
  { name: 'address', label: 'Address', type: 'textarea', full: true },
];

export default function Students() {
  const { school } = useAuth();
  const [filter, setFilter] = useState({});
  const [q, setQ] = useState('');
  const [rows, reload, { error }] = useData('/students' + qs({ ...filter, q }));
  const [routes] = useData('/transport/routes');
  const [edit, setEdit] = useState(null);
  const [creds, setCreds] = useState(null);
  const [card, setCard] = useState(null);

  const save = async (e) => {
    e.preventDefault();
    if (edit.id) { if (await run(() => put(`/students/${edit.id}`, edit), 'Student updated')) { setEdit(null); reload(); } return; }
    const r = await run(() => post('/students', edit));
    if (r) { setEdit(null); reload(); setCreds([r.credentials.student, r.credentials.parent]); }
  };
  const resetPwd = async (s, role) => {
    if (!confirmDo(`Generate a new ${role} password for ${s.name}?`)) return;
    const r = await run(() => post(`/students/${s.id}/reset-password`, { role }));
    if (r) setCreds([r]);
  };
  const remove = async (s) => { if (confirmDo(`Delete ${s.name} and their student & parent logins? This also removes attendance, results and fee records.`) && await run(() => del(`/students/${s.id}`), 'Student deleted')) reload(); };

  return (<Page title="Students" sub="Add students — a student login and a parent login are created automatically."
    actions={<button className="btn" onClick={() => setEdit({ ...filter, concession_pct: 0 })}>＋ Add student</button>}>
    <div className="filters"><ClassPicker value={filter} onChange={setFilter} allowAll /><input placeholder="Search name / admission no." value={q} onChange={(e) => setQ(e.target.value)} /></div>
    <ErrorBox error={error} />
    {!rows ? <Loading /> : <div className="card flush"><div className="table-wrap"><table>
      <thead><tr><th>Adm. No.</th><th>Name</th><th>Class</th><th className="hide-sm">Father's name</th><th className="hide-sm">Mobile</th><th className="hide-sm">Logins</th><th /></tr></thead>
      <tbody>{rows.map(s => <tr key={s.id}>
        <td>{s.admission_no}</td><td><b>{s.name}</b>{!s.active && <> <Badge tone="bad">Inactive</Badge></>}{s.route_no && <div className="small muted">🚌 {s.route_no}</div>}</td>
        <td className="nowrap">{s.class}-{s.section}{s.roll_no && <span className="muted small"> · #{s.roll_no}</span>}</td>
        <td className="hide-sm">{s.father_name}</td><td className="hide-sm">{s.mobile}</td>
        <td className="hide-sm small">{s.student_username} / {s.parent_username}</td>
        <td className="nowrap right">
          <button className="btn sm secondary" onClick={() => setCard(s)}>ID card</button>{' '}
          <button className="btn sm secondary" onClick={() => setEdit(s)}>Edit</button>{' '}
          <select className="btn sm secondary" style={{ width: 'auto', minHeight: 30 }} value="" onChange={(e) => { const v = e.target.value; e.target.value = ''; v === 'del' ? remove(s) : resetPwd(s, v); }} aria-label="More actions">
            <option value="">More…</option><option value="student">Reset student password</option><option value="parent">Reset parent password</option><option value="del">Delete student</option>
          </select></td>
      </tr>)}</tbody></table>{!rows.length && <div className="empty">No students found.</div>}</div></div>}

    {edit && <Modal wide title={edit.id ? `Edit ${edit.name}` : 'Add student'} onClose={() => setEdit(null)}
      footer={<><button className="btn secondary" onClick={() => setEdit(null)}>Cancel</button><button className="btn" form="sf">{edit.id ? 'Save' : 'Add student & create logins'}</button></>}>
      <form id="sf" className="form-grid" onSubmit={save}>
        {FIELDS(!edit.id, routes || []).map(f => <Field key={f.name} f={edit.id && f.name === 'admission_no' ? { ...f, render: (v) => <input value={v} disabled /> } : f} value={edit[f.name]} onChange={(k, v) => setEdit(p => ({ ...p, [k]: v }))} />)}
        {edit.id && <Field f={{ name: 'active', label: 'Active (unticking disables the student & parent logins)', type: 'checkbox' }} value={edit.active} onChange={(k, v) => setEdit(p => ({ ...p, active: v }))} />}
      </form>
    </Modal>}
    {creds && <CredentialBox creds={creds} onClose={() => setCreds(null)} />}
    {card && <Modal title="Student ID card" onClose={() => setCard(null)} footer={<button className="btn" onClick={() => window.print()}>Print</button>}>
      <div style={{ display: 'grid', placeItems: 'center' }}><IdCard s={card} school={school} /></div></Modal>}
  </Page>);
}
