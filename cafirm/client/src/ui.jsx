import React, { useCallback, useEffect, useState } from 'react';

export const STATUS = {
  not_started: ['Not started', 'grey'], awaiting_documents: ['Awaiting documents', 'amber'], in_progress: ['In progress', 'blue'],
  under_review: ['Under review', 'purple'], filed: ['Filed', 'green'], not_applicable: ['Not applicable', 'grey'],
  submitted: ['Submitted', 'grey'], documents_pending: ['Documents pending', 'amber'], completed: ['Completed', 'green'], rejected: ['Rejected', 'red'],
};
export const FILING_STATUSES = ['not_started', 'awaiting_documents', 'in_progress', 'under_review', 'filed', 'not_applicable'];
export const REG_STATUSES = ['submitted', 'documents_pending', 'in_progress', 'completed', 'rejected'];
export const DOC_KINDS = { compliance_document: 'Compliance document', tax_report: 'Tax report', filing_acknowledgement: 'Filing acknowledgement', registration_document: 'Registration document', client_upload: 'Uploaded by customer', other: 'Other' };
export const ROLE_LABEL = { admin: 'Administrator', ca: 'Chartered Accountant', intern: 'Intern', customer: 'Customer' };

export const Badge = ({ status, children, tone }) => {
  const [label, t] = STATUS[status] || [children || status, tone || 'grey'];
  return <span className={`badge ${tone || t}`}>{children || label}</span>;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function fmtDate(d) {
  if (!d) return '–';
  const [y, m, day] = d.slice(0, 10).split('-').map(Number);
  return `${day} ${MONTHS[m - 1]} ${y}`;
}
export const fmtDateTime = (d) => (d ? `${fmtDate(d)}, ${d.slice(11, 16)}` : '–'); // server times are UTC
export const fmtSize = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** "Overdue by 3 days" / "Due today" / "Due in 12 days" for an open filing. */
export function DueChip({ f }) {
  if (['filed', 'not_applicable'].includes(f.status)) return null;
  if (f.days_left < 0) return <span className="chip red">Overdue by {-f.days_left} day{f.days_left === -1 ? '' : 's'}</span>;
  if (f.days_left === 0) return <span className="chip red">Due today</span>;
  return <span className={`chip ${f.days_left <= 7 ? 'amber' : 'grey'}`}>Due in {f.days_left} day{f.days_left === 1 ? '' : 's'}</span>;
}

export function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head"><h2>{title}</h2><button className="icon-btn" onClick={onClose} aria-label="Close">✕</button></div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export const Field = ({ label, hint, children, wide }) => (
  <label className={`field ${wide ? 'wide' : ''}`}><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>
);

export const Empty = ({ children }) => <div className="empty">{children}</div>;
export const ErrorMsg = ({ error }) => (error ? <div className="alert error" role="alert">{error}</div> : null);

/** Load data on mount / whenever deps change; returns { data, loading, error, reload }. */
export function useLoad(fn, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: '' });
  const run = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: '' }));
    return fn().then((data) => setState({ data, loading: false, error: '' }), (e) => setState({ data: null, loading: false, error: e.message }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { run(); }, [run]);
  return { ...state, reload: run };
}

export function Loading({ state }) {
  if (state.loading && !state.data) return <div className="empty">Loading…</div>;
  if (state.error) return <ErrorMsg error={state.error} />;
  return null;
}

export const Toast = ({ msg }) => (msg ? <div className="toast" role="status">{msg}</div> : null);
export function useToast() {
  const [msg, setMsg] = useState('');
  const show = useCallback((m) => { setMsg(m); setTimeout(() => setMsg(''), 3500); }, []);
  return [msg, show];
}

export const Tabs = ({ tabs, value, onChange }) => (
  <div className="tabs" role="tablist">{tabs.map(([k, label]) => <button key={k} role="tab" aria-selected={value === k} className={value === k ? 'active' : ''} onClick={() => onChange(k)}>{label}</button>)}</div>
);

export const currentFY = () => { const d = new Date(), y = d.getFullYear(), s = d.getMonth() >= 3 ? y : y - 1; return `${s}-${String((s + 1) % 100).padStart(2, '0')}`; };
export const fyOptions = () => { const s = parseInt(currentFY(), 10); return [s + 1, s, s - 1, s - 2].map((y) => `${y}-${String((y + 1) % 100).padStart(2, '0')}`); };
