import { useEffect, useState, useCallback, createContext, useContext } from 'react';
import { get } from './api.js';

export const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: Number(n) % 1 ? 2 : 0 });
export const fmtDate = (d) => (d ? new Date(d.length === 10 ? d + 'T00:00:00' : d.replace(' ', 'T') + (d.includes('T') || d.length === 10 ? '' : 'Z')).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
export const monthLabel = (m) => (m && /^\d{4}-\d{2}$/.test(m) ? new Date(m + '-01T00:00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) : m);
export const todayISO = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
export const thisMonth = () => todayISO().slice(0, 7);
export const CLASSES = ['Nursery', 'LKG', 'UKG', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
export const SECTIONS = ['A', 'B', 'C', 'D', 'E'];
export const SUBJECTS = ['English', 'Hindi', 'Mathematics', 'Science', 'Social Science', 'Sanskrit', 'Computer Science', 'Physics', 'Chemistry', 'Biology', 'Accountancy', 'Economics', 'Business Studies', 'Physical Education', 'EVS', 'Art', 'Music'];
export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Fetch helper: const [data, reload, {loading, error}] = useData('/path') */
export function useData(path, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    if (!path) { setLoading(false); return; }
    setLoading(true);
    try { setData(await get(path)); setError(''); } catch (e) { setError(e.message); } finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);
  useEffect(() => { load(); }, [load]);
  return [data, load, { loading, error, setData }];
}

let toastFn = () => {};
export const toast = (msg, err) => toastFn(msg, err);
export function Toaster() {
  const [t, setT] = useState(null);
  useEffect(() => { toastFn = (msg, err) => { setT({ msg, err }); clearTimeout(window.__tt); window.__tt = setTimeout(() => setT(null), 3500); }; }, []);
  return t ? <div className={`toast ${t.err ? 'err' : ''}`} role="status">{t.msg}</div> : null;
}
/** Wrap an async action: shows a toast on success/error. */
export async function run(fn, okMsg) {
  try { const r = await fn(); if (okMsg) toast(typeof okMsg === 'function' ? okMsg(r) : okMsg); return r ?? true; }
  catch (e) { toast(e.message, true); return false; }
}

export function Page({ title, sub, actions, children }) {
  return (<div>
    <div className="page-head"><div><h1>{title}</h1>{sub && <div className="sub">{sub}</div>}</div><div className="spacer" />{actions}</div>
    <div className="stack">{children}</div>
  </div>);
}
export function Modal({ title, onClose, children, footer, wide }) {
  useEffect(() => { const h = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [onClose]);
  return (<div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-label={title}>
      <div className="modal-h"><h2>{title}</h2><button className="btn ghost icon" onClick={onClose} aria-label="Close">✕</button></div>
      <div className="modal-b">{children}</div>
      {footer && <div className="modal-f">{footer}</div>}
    </div>
  </div>);
}
export const Stat = ({ label, value, icon, tone }) => (
  <div className="card stat"><span className="ic">{icon}</span><div className="v" style={tone ? { color: `var(--${tone})` } : null}>{value}</div><div className="l">{label}</div></div>);
export const Empty = ({ children = 'Nothing here yet.' }) => <div className="empty">{children}</div>;
export const Loading = () => <div className="empty">Loading…</div>;
export const ErrorBox = ({ error }) => (error ? <div className="alert">{error}</div> : null);

const TONES = { Paid: 'ok', Approved: 'ok', Returned: 'ok', Active: 'ok', Completed: 'ok', P: 'ok', Present: 'ok', Processed: 'info', Issued: 'info', 'In Progress': 'info', Due: 'warn', Pending: 'warn', 'Partially Paid': 'warn', Planned: 'primary', L: 'warn', HD: 'warn', Overdue: 'bad', Rejected: 'bad', Removed: 'bad', A: 'bad', Absent: 'bad', H: '' };
export const Badge = ({ children, tone }) => <span className={`badge ${tone ?? TONES[children] ?? ''}`}>{children}</span>;

/** Generic form field. */
export function Field({ f, value, onChange, form = {} }) {
  const set = (v) => onChange(f.name, v);
  let input;
  if (f.type === 'select') input = (<select value={value ?? ''} onChange={(e) => set(e.target.value)} required={f.required}>
      {!f.noBlank && <option value="">{f.placeholder || '— Select —'}</option>}
      {(typeof f.options === 'function' ? f.options(form) : f.options).map(o => typeof o === 'object' ? <option key={o.value} value={o.value}>{o.label}</option> : <option key={o}>{o}</option>)}
    </select>);
  else if (f.type === 'textarea') input = <textarea value={value ?? ''} onChange={(e) => set(e.target.value)} required={f.required} placeholder={f.placeholder} />;
  else if (f.type === 'checkbox') return (<label className="row small" style={{ fontWeight: 600 }}><input type="checkbox" checked={!!Number(value)} onChange={(e) => set(e.target.checked ? 1 : 0)} />{f.label}</label>);
  else if (f.render) input = f.render(value, set, form);
  else input = <input type={f.type || 'text'} value={value ?? ''} onChange={(e) => set(e.target.value)} required={f.required} placeholder={f.placeholder} step={f.step} min={f.min} max={f.max} />;
  return <label className={`f ${f.full ? 'full' : ''}`}>{f.label}{f.required && ' *'}{input}{f.hint && <span className="small" style={{ fontWeight: 400 }}>{f.hint}</span>}</label>;
}

/** Class & section picker built from the administrator's classes. `only` limits it to [{class, section}] pairs. */
export function ClassPicker({ value, onChange, allowAll, needSection = true, only }) {
  const { structure } = useAuth();
  const classes = (structure?.classes || []).filter(c => !only || only.some(o => o.class === c.name));
  const sections = (classes.find(c => c.name === value.class)?.sections || []).filter(s => !only || only.some(o => o.class === value.class && o.section === s.name));
  return (<>
    <select value={value.class || ''} onChange={(e) => onChange({ ...value, class: e.target.value, section: '' })} aria-label="Class">
      <option value="">{allowAll ? 'All classes' : 'Class'}</option>{classes.map(c => <option key={c.id} value={c.name}>Class {c.name}</option>)}
    </select>
    {needSection && <select value={value.section || ''} onChange={(e) => onChange({ ...value, section: e.target.value })} aria-label="Section">
      <option value="">{allowAll ? 'All sections' : 'Section'}</option>{sections.map(s => <option key={s.id}>{s.name}</option>)}
    </select>}
  </>);
}

/**
 * What the signed-in user may work on, from the administrator's allotments.
 *  classTeacher: sections they are class teacher of · linked: sections they teach in any way
 *  subjects: [{class, section, subject}] they may write subject content for.  Administrators get everything.
 */
export function useAccess() {
  const { user, scope, structure } = useAuth();
  const admin = user.role === 'admin';
  const all = (structure?.classes || []).flatMap(c => c.sections.map(s => ({ class: c.name, section: s.name })));
  const allSubjects = (structure?.subjects || []).map(s => s.name);
  const classTeacher = admin ? all : (scope?.classTeacherOf || []);
  const linked = admin ? all : (scope?.linked || []);
  const subjects = admin ? all.flatMap(p => allSubjects.map(subject => ({ ...p, subject }))) : (scope?.subjects || []);
  const sectionsOf = (cls) => (structure?.classes || []).find(c => c.name === cls)?.sections.map(s => s.name) || [];
  return {
    admin, all, classTeacher, linked, subjects, allSubjects, exams: structure?.exams || [],
    isClassTeacher: (cls, sec) => admin || classTeacher.some(p => p.class === cls && p.section === sec),
    isLinked: (cls, sec) => admin || linked.some(p => p.class === cls && p.section === sec),
    /** Subject allowed in class/section; blank section = every section of the class. */
    teaches: (cls, sec, subject) => admin || (sec ? subjects.some(p => p.class === cls && p.section === sec && p.subject === subject)
      : sectionsOf(cls).length > 0 && sectionsOf(cls).every(x => subjects.some(p => p.class === cls && p.section === x && p.subject === subject))),
    sectionsOf,
    classesIn: (pairs) => [...new Set(pairs.map(p => p.class))].sort((a, b) => order(structure, a) - order(structure, b)),
  };
}
const order = (structure, cls) => (structure?.classes || []).findIndex(c => c.name === cls);

export const classLabel = (r) => (r.class ? `Class ${r.class}${r.section ? '-' + r.section : ''}` : 'Whole school');
export const confirmDo = (msg) => window.confirm(msg);
