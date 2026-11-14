import { fileUrl } from '../api.js';
import { useAuth, Page, fmtDate } from '../ui.jsx';

export function IdCard({ s, school }) {
  return (<div className="idcard">
    <div className="top"><b>{school?.school_name}</b><small>{school?.school_address}</small><div style={{ height: 40 }} /></div>
    <div className="photo">{s.photo_url ? <img src={fileUrl(s.photo_url)} alt={s.name} /> : s.name[0]}</div>
    <div className="body">
      <div style={{ textAlign: 'center' }}><h2 style={{ margin: 0 }}>{s.name}</h2><div className="muted small">STUDENT IDENTITY CARD · {school?.academic_year}</div></div>
      <dl>
        <dt>Admission No.</dt><dd>{s.admission_no}</dd>
        <dt>Class & Section</dt><dd>{s.class} – {s.section}{s.roll_no ? ` (Roll ${s.roll_no})` : ''}</dd>
        <dt>Father's Name</dt><dd>{s.father_name || '—'}</dd>
        <dt>Mother's Name</dt><dd>{s.mother_name || '—'}</dd>
        <dt>Date of Birth</dt><dd>{fmtDate(s.dob)}</dd>
        <dt>Mobile No.</dt><dd>{s.mobile || '—'}</dd>
        {s.blood_group && <><dt>Blood Group</dt><dd>{s.blood_group}</dd></>}
        {s.route_no && <><dt>Bus Route</dt><dd>{s.route_no}</dd></>}
        <dt>Address</dt><dd>{s.address || '—'}</dd>
      </dl>
    </div>
    <div className="foot" />
  </div>);
}

export default function Profile() {
  const { student, school } = useAuth();
  return (<Page title="My Profile" sub="Your school identity card. Contact your class teacher to correct any details." actions={<button className="btn secondary no-print" onClick={() => window.print()}>Print</button>}>
    <div style={{ display: 'grid', placeItems: 'center' }}><IdCard s={student} school={school} /></div>
  </Page>);
}
