import { uploadFile, fileUrl } from '../api.js';
import CrudPage from '../CrudPage.jsx';
import { useAuth, Badge, fmtDate, classLabel, CLASSES, SECTIONS, SUBJECTS, run, todayISO } from '../ui.jsx';

const classFields = [
  { name: 'class', label: 'Class', type: 'select', options: CLASSES, placeholder: 'All classes' },
  { name: 'section', label: 'Section', type: 'select', options: SECTIONS, placeholder: 'All sections' },
];
const subject = { name: 'subject', label: 'Subject', type: 'select', options: SUBJECTS, required: true };
const uploadField = (name, label, accept, hint) => ({ name, label, full: true, hint, render: (v, set) => (<div className="stack">
  <div className="row"><input type="file" accept={accept} onChange={async (e) => { const f = e.target.files[0]; if (f) { const r = await run(() => uploadFile(f), 'File uploaded'); if (r) set(r.url); } }} /></div>
  <input placeholder="…or paste a link" value={v || ''} onChange={(e) => set(e.target.value)} />
  {v && <a href={fileUrl(v)} target="_blank" rel="noreferrer" className="small">Open current file ↗</a>}</div>) });

const youtubeId = (u) => (u || '').match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/)?.[1];

const Card = ({ r, title, meta, children }) => (<div className="card feed-item"><div className="meta">{meta}</div><h3 style={{ margin: 0 }}>{title}</h3>{children}</div>);

const CONFIG = {
  notices: {
    title: 'Notices', sub: 'Circulars and announcements', itemName: 'notice', newLabel: 'New notice',
    fields: [{ name: 'title', label: 'Title', required: true, full: true }, { name: 'category', label: 'Category', type: 'select', options: ['General', 'Academic', 'Exam', 'Fees', 'Library', 'Transport', 'Holiday', 'Event'] },
      { name: 'notice_date', label: 'Date', type: 'date' }, ...classFields, { name: 'body', label: 'Notice', type: 'textarea', full: true }],
    defaults: () => ({ category: 'General', notice_date: todayISO() }),
    columns: [{ label: 'Date', render: r => <span className="nowrap">{fmtDate(r.notice_date)}</span> }, { label: 'Title', render: r => <><b>{r.title}</b><div className="small muted">{(r.body || '').slice(0, 90)}</div></> },
      { label: 'Category', render: r => <Badge tone="primary">{r.category}</Badge> }, { label: 'For', render: r => r.student_id ? 'Individual student' : classLabel(r) }],
    card: r => <Card title={r.title} meta={<><Badge tone={r.category === 'Library' ? 'warn' : 'primary'}>{r.category}</Badge><span>{fmtDate(r.notice_date)}</span>{r.student_id && <Badge tone="info">Personal</Badge>}</>}><p>{r.body}</p></Card>,
    empty: 'No notices.',
  },
  materials: {
    title: 'Study Material', sub: 'Notes, worksheets and books in PDF format', itemName: 'material', newLabel: 'Upload material',
    fields: [{ name: 'title', label: 'Title', required: true }, subject, ...classFields, uploadField('file_url', 'PDF file', '.pdf,application/pdf,.doc,.docx,.ppt,.pptx', 'PDF recommended'), { name: 'description', label: 'Description', type: 'textarea', full: true }],
    columns: [{ label: 'Title', render: r => <a href={fileUrl(r.file_url)} target="_blank" rel="noreferrer"><b>📄 {r.title}</b></a> }, { key: 'subject', label: 'Subject' }, { label: 'For', render: classLabel }, { label: 'Added', render: r => fmtDate(r.created_at) }],
    card: r => <Card title={r.title} meta={<><Badge tone="primary">{r.subject}</Badge><span>{fmtDate(r.created_at)}</span></>}>{r.description && <p>{r.description}</p>}
      <div className="row" style={{ marginTop: 10 }}><a className="btn sm" href={fileUrl(r.file_url)} target="_blank" rel="noreferrer">📄 Open PDF</a><a className="btn sm secondary" href={fileUrl(r.file_url)} download>Download</a></div></Card>,
    empty: 'No study material uploaded yet.',
  },
  videos: {
    title: 'Video Classes', sub: 'Recorded lectures – upload a video or paste a YouTube / Google Drive link', itemName: 'video', newLabel: 'Add video',
    fields: [{ name: 'title', label: 'Title', required: true }, subject, ...classFields, uploadField('video_url', 'Video', 'video/mp4,video/webm', 'MP4 upload or YouTube link'), { name: 'description', label: 'Description', type: 'textarea', full: true }],
    columns: [{ label: 'Title', render: r => <a href={fileUrl(r.video_url)} target="_blank" rel="noreferrer"><b>🎬 {r.title}</b></a> }, { key: 'subject', label: 'Subject' }, { label: 'For', render: classLabel }, { label: 'Added', render: r => fmtDate(r.created_at) }],
    card: r => { const y = youtubeId(r.video_url); return <Card title={r.title} meta={<><Badge tone="primary">{r.subject}</Badge><span>{fmtDate(r.created_at)}</span></>}>
      {r.description && <p>{r.description}</p>}
      <div style={{ marginTop: 10, maxWidth: 720 }}>{y ? <div style={{ position: 'relative', paddingTop: '56.25%' }}><iframe title={r.title} src={`https://www.youtube-nocookie.com/embed/${y}`} allowFullScreen style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0, borderRadius: 10 }} /></div>
        : /\.(mp4|webm)$/i.test(r.video_url) ? <video src={fileUrl(r.video_url)} controls style={{ width: '100%', borderRadius: 10 }} /> : <a className="btn sm" href={r.video_url} target="_blank" rel="noreferrer">▶ Watch video</a>}</div></Card>; },
    empty: 'No video classes yet.',
  },
  homework: {
    title: 'Homework', sub: 'Subject-wise homework', itemName: 'homework', newLabel: 'Assign homework',
    fields: [subject, { name: 'title', label: 'Title', required: true }, { name: 'class', label: 'Class', type: 'select', options: CLASSES, required: true }, classFields[1],
      { name: 'assigned_date', label: 'Assigned on', type: 'date' }, { name: 'due_date', label: 'Due date', type: 'date' }, { name: 'description', label: 'Details', type: 'textarea', full: true },
      uploadField('attachment_url', 'Attachment (optional)', '.pdf,image/*')],
    defaults: () => ({ assigned_date: todayISO() }),
    columns: [{ key: 'subject', label: 'Subject' }, { label: 'Homework', render: r => <><b>{r.title}</b><div className="small muted">{(r.description || '').slice(0, 80)}</div></> }, { label: 'Class', render: classLabel },
      { label: 'Due', render: r => <span className="nowrap">{fmtDate(r.due_date)}</span> }],
    group: 'subject',
    card: r => <Card title={r.title} meta={<><Badge tone="primary">{r.subject}</Badge><span>Given {fmtDate(r.assigned_date)}</span>{r.due_date && <Badge tone={r.due_date < todayISO() ? '' : 'warn'}>{`Due ${fmtDate(r.due_date)}`}</Badge>}</>}>
      {r.description && <p>{r.description}</p>}{r.attachment_url && <a className="btn sm secondary" style={{ marginTop: 8 }} href={fileUrl(r.attachment_url)} target="_blank" rel="noreferrer">📎 Attachment</a>}</Card>,
    empty: 'No homework assigned.',
  },
  lesson_plans: {
    title: 'Lesson Plans', sub: 'Subject-wise weekly lesson plans', itemName: 'lesson plan', newLabel: 'Add lesson plan', endpoint: '/lesson-plans',
    fields: [subject, { name: 'topic', label: 'Topic / Chapter', required: true }, ...classFields, { name: 'week_start', label: 'Week starting', type: 'date' },
      { name: 'status', label: 'Status', type: 'select', options: ['Planned', 'In Progress', 'Completed'], noBlank: true },
      { name: 'objectives', label: 'Learning objectives', type: 'textarea', full: true }, { name: 'activities', label: 'Teaching activities & resources', type: 'textarea', full: true }],
    defaults: () => ({ status: 'Planned', week_start: todayISO() }),
    columns: [{ key: 'subject', label: 'Subject' }, { label: 'Topic', render: r => <b>{r.topic}</b> }, { label: 'Class', render: classLabel }, { label: 'Week of', render: r => fmtDate(r.week_start) }, { label: 'Status', render: r => <Badge>{r.status}</Badge> }],
    group: 'subject',
    card: r => <Card title={r.topic} meta={<><Badge tone="primary">{r.subject}</Badge><span>Week of {fmtDate(r.week_start)}</span><Badge>{r.status}</Badge></>}>
      {r.objectives && <p><b>Objectives:</b> {r.objectives}</p>}{r.activities && <p><b>Activities:</b> {r.activities}</p>}</Card>,
    empty: 'No lesson plans yet.',
  },
  events: {
    title: 'Events', sub: 'Upcoming school events and activities', itemName: 'event', newLabel: 'Add event',
    fields: [{ name: 'title', label: 'Event', required: true }, { name: 'event_date', label: 'Date', type: 'date', required: true }, { name: 'venue', label: 'Venue' }, ...classFields, { name: 'description', label: 'Description', type: 'textarea', full: true }],
    columns: [{ label: 'Date', render: r => <span className="nowrap">{fmtDate(r.event_date)}</span> }, { label: 'Event', render: r => <b>{r.title}</b> }, { key: 'venue', label: 'Venue' }, { label: 'For', render: classLabel }],
    card: r => <Card title={`🎉 ${r.title}`} meta={<><Badge tone="primary">{fmtDate(r.event_date)}</Badge>{r.venue && <span>📍 {r.venue}</span>}</>}>{r.description && <p>{r.description}</p>}</Card>,
    empty: 'No upcoming events.',
  },
  datesheets: {
    title: 'Date Sheets', sub: 'Examination schedules', itemName: 'exam paper', newLabel: 'Add exam paper',
    fields: [{ name: 'exam_name', label: 'Exam', required: true, placeholder: 'e.g. Half Yearly 2026' }, { name: 'class', label: 'Class', type: 'select', options: CLASSES, required: true }, classFields[1], subject,
      { name: 'exam_date', label: 'Date', type: 'date', required: true }, { name: 'start_time', label: 'Starts', type: 'time' }, { name: 'end_time', label: 'Ends', type: 'time' }, { name: 'room', label: 'Room / Hall' }],
    columns: [{ key: 'exam_name', label: 'Exam' }, { label: 'Class', render: classLabel }, { label: 'Date', render: r => <span className="nowrap">{fmtDate(r.exam_date)}</span> }, { key: 'subject', label: 'Subject' }, { label: 'Time', render: r => `${r.start_time || ''}–${r.end_time || ''}` }, { key: 'room', label: 'Room' }],
    familyTable: true, empty: 'No date sheet published yet.',
  },
};

export default function Content({ kind }) {
  const { user } = useAuth();
  const c = CONFIG[kind];
  const family = ['student', 'parent'].includes(user.role);
  const writers = { notices: ['admin', 'teacher', 'librarian', 'accountant', 'driver'] }[kind] || ['admin', 'teacher'];
  const canWrite = writers.includes(user.role);
  // Students see grouped feeds (homework & lesson plans grouped by subject)
  const renderCard = family && !c.familyTable ? c.card : null;
  const transform = family && c.group ? (rows) => rows.slice().sort((a, b) => (a[c.group] || '').localeCompare(b[c.group] || '')) : undefined;
  return <CrudPage key={kind} title={c.title} sub={c.sub} endpoint={c.endpoint || `/${kind}`} fields={c.fields} columns={c.columns} canWrite={canWrite}
    renderCard={renderCard} defaults={c.defaults?.()} classFilter={!family} emptyText={c.empty} newLabel={c.newLabel} itemName={c.itemName} transformLoad={transform} />;
}
