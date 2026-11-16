export const httpError = (status, message) => Object.assign(new Error(message), { status });
export const today = () => new Date().toISOString().slice(0, 10);
/** '' / undefined -> null, so values can be bound to SQL safely. */
export const nul = (v) => (v === undefined || v === '' ? null : v);
export const str = (v) => (typeof v === 'string' ? v.trim() : v);
export function need(body, ...fields) {
  for (const f of fields) if (body[f] === undefined || body[f] === null || String(body[f]).trim() === '') throw httpError(400, `${f.replace(/_/g, ' ')} is required`);
}
export const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !isNaN(Date.parse(s));
export const FILING_STATUSES = ['not_started', 'awaiting_documents', 'in_progress', 'under_review', 'filed', 'not_applicable'];
export const CLOSED = ['filed', 'not_applicable'];
export const REG_STATUSES = ['submitted', 'documents_pending', 'in_progress', 'completed', 'rejected'];
export const STATUS_LABEL = {
  not_started: 'Not started', awaiting_documents: 'Awaiting documents', in_progress: 'In progress', under_review: 'Under review',
  filed: 'Filed', not_applicable: 'Not applicable', submitted: 'Submitted', documents_pending: 'Documents pending', completed: 'Completed', rejected: 'Rejected',
};
