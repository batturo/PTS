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
export function Field({ f, value, onChange }) {
  const set = (v) => onChange(f.name, v);
  let input;
  if (f.type === 'select') input = (<select value={value ?? ''} onChange={(e) => set(e.target.value)} required={f.required}>
      {!f.noBlank && <option value="">{f.placeholder || '— Select —'}</option>}
      {(typeof f.options === 'function' ? f.options() : f.options).map(o => typeof o === 'object' ? <option key={o.value} value={o.value}>{o.label}</option> : <option key={o}>{o}</option>)}
    </select>);
  else if (f.type === 'textarea') input = <textarea value={value ?? ''} onChange={(e) => set(e.target.value)} required={f.required} placeholder={f.placeholder} />;
  else if (f.type === 'checkbox') return (<label className="row small" style={{ fontWeight: 600 }}><input type="checkbox" checked={!!Number(value)} onChange={(e) => set(e.target.checked ? 1 : 0)} />{f.label}</label>);
  else if (f.render) input = f.render(value, set);
  else input = <input type={f.type || 'text'} value={value ?? ''} onChange={(e) => set(e.target.value)} required={f.required} placeholder={f.placeholder} step={f.step} min={f.min} max={f.max} />;
  return <label className={`f ${f.full ? 'full' : ''}`}>{f.label}{f.required && ' *'}{input}{f.hint && <span className="small" style={{ fontWeight: 400 }}>{f.hint}</span>}</label>;
}

/** Class & section picker. */
export function ClassPicker({ value, onChange, allowAll, needSection = true }) {
  return (<>
    <select value={value.class || ''} onChange={(e) => onChange({ ...value, class: e.target.value })} aria-label="Class">
      <option value="">{allowAll ? 'All classes' : 'Class'}</option>{CLASSES.map(c => <option key={c} value={c}>Class {c}</option>)}
    </select>
    {needSection && <select value={value.section || ''} onChange={(e) => onChange({ ...value, section: e.target.value })} aria-label="Section">
      <option value="">{allowAll ? 'All sections' : 'Section'}</option>{SECTIONS.map(s => <option key={s}>{s}</option>)}
    </select>}
  </>);
}

export const classLabel = (r) => (r.class ? `Class ${r.class}${r.section ? '-' + r.section : ''}` : 'Whole school');
export const confirmDo = (msg) => window.confirm(msg);
