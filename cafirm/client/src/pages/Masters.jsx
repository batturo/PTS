import React, { useState } from 'react';
import { api } from '../api.js';
import { Badge, Empty, ErrorMsg, Field, Loading, Modal, Tabs, currentFY, fmtDate, fyOptions, useLoad, useToast, Toast } from '../ui.jsx';

const FREQ = { monthly: 'Monthly', quarterly: 'Quarterly', half_yearly: 'Half-yearly', annual: 'Annual', custom: 'Custom dates' };
const COND = { '': 'Always', gst: 'Only if GST-registered', employees: 'Only if it has employees', tds: 'Only if it deducts TDS' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const blank = { name: '', category: 'GST', form_no: '', description: '', frequency: 'monthly', due_day: 20, due_offset_months: 1, schedule: [{ label: '', month: 7, day: 31, year_offset: 1 }], condition: '', entities: [], active: true };

function TemplateForm({ t, types, onClose, onDone }) {
  const [f, setF] = useState(t ? { ...blank, ...t, schedule: t.schedule || blank.schedule } : blank), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const periodic = ['monthly', 'quarterly'].includes(f.frequency);
  const toggle = (code) => setF({ ...f, entities: f.entities.includes(code) ? f.entities.filter((c) => c !== code) : [...f.entities, code] });
  const row = (i, k, v) => setF({ ...f, schedule: f.schedule.map((r, j) => (j === i ? { ...r, [k]: v } : r)) });
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { const r = t ? await api.put(`/templates/${t.id}`, f) : await api.post('/templates', f); onDone(r); } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  return (
    <Modal title={t ? 'Edit compliance' : 'New compliance'} onClose={onClose} wide>
      <form onSubmit={submit} className="form-grid">
        <Field label="Name" wide><input value={f.name} onChange={set('name')} required /></Field>
        <Field label="Category"><select value={f.category} onChange={set('category')}>{['GST', 'Income Tax', 'TDS', 'ROC / MCA', 'Labour', 'Other'].map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Form / challan no."><input value={f.form_no || ''} onChange={set('form_no')} /></Field>
        <Field label="Description" wide><textarea value={f.description || ''} onChange={set('description')} style={{ minHeight: 56 }} /></Field>
        <Field label="Frequency"><select value={f.frequency} onChange={set('frequency')}>{Object.entries(FREQ).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Applies"><select value={f.condition} onChange={set('condition')}>{Object.entries(COND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        {periodic ? <>
          <Field label="Due day of month"><input type="number" min="1" max="31" value={f.due_day ?? ''} onChange={set('due_day')} required /></Field>
          <Field label="Months after the period ends" hint="1 = the following month"><input type="number" min="0" max="12" value={f.due_offset_months ?? 1} onChange={set('due_offset_months')} /></Field></> : (
          <div className="wide"><b className="small muted">Due dates in each financial year</b>
            {f.schedule.map((r, i) => <div className="sched-row" key={i}>
              <Field label="Label"><input value={r.label} onChange={(e) => row(i, 'label', e.target.value)} placeholder="e.g. Q1" /></Field>
              <Field label="Month"><select value={r.month} onChange={(e) => row(i, 'month', Number(e.target.value))}>{MONTHS.map((m, j) => <option key={m} value={j + 1}>{m}</option>)}</select></Field>
              <Field label="Day"><input type="number" min="1" max="31" value={r.day} onChange={(e) => row(i, 'day', Number(e.target.value))} /></Field>
              <Field label="Year"><select value={r.year_offset} onChange={(e) => row(i, 'year_offset', Number(e.target.value))}><option value={0}>FY start year</option><option value={1}>FY end year</option></select></Field>
              <button type="button" className="small danger" onClick={() => setF({ ...f, schedule: f.schedule.filter((_, j) => j !== i) })}>✕</button></div>)}
            <button type="button" className="small" onClick={() => setF({ ...f, schedule: [...f.schedule, { label: '', month: 3, day: 31, year_offset: 1 }] })}>+ Add a due date</button>
            <p className="muted small">For FY 2026-27, “FY start year” means 2026 and “FY end year” means 2027. Example: ITR due 31 Jul 2027 → Jul 31, FY end year.</p></div>)}
        <div className="wide"><b className="small muted">Applies to these types of institution</b>
          <div className="entity-grid">{types.map((e) => <label className="check" key={e.code}><input type="checkbox" checked={f.entities.includes(e.code)} onChange={() => toggle(e.code)} />{e.name}</label>)}</div>
          <p><button type="button" className="small" onClick={() => setF({ ...f, entities: types.map((e) => e.code) })}>Select all</button></p></div>
        {t && <label className="check wide"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />Active (inactive compliances are not generated for new years)</label>}
        <div className="wide"><ErrorMsg error={err} />{t && <p className="muted small">Saving moves the due dates of all customers’ unfiled filings to the new rule.</p>}<button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button></div>
      </form>
    </Modal>
  );
}

function DueDates({ t, onClose }) {
  const [fy, setFy] = useState(currentFY()), [toast, say] = useToast();
  const s = useLoad(() => api.get(`/templates/${t.id}/due-dates?fy=${fy}`), [t.id, fy]);
  const [edit, setEdit] = useState(null), [err, setErr] = useState('');
  const save = async (e) => {
    e.preventDefault(); setErr('');
    try { const r = await api.put(`/templates/${t.id}/due-dates`, { fy, period_label: edit.period_label, due_date: edit.due_date, reason: edit.reason, notify: edit.notify }); say(`${r.filings_updated} filings updated${r.notified ? `, ${r.notified} customers notified` : ''}`); setEdit(null); s.reload(); } catch (x) { setErr(x.message); }
  };
  const reset = async (p) => { if (!confirm('Go back to the standard due date for everyone?')) return; try { await api.del(`/templates/${t.id}/due-dates`, { fy, period_label: p.period_label }); s.reload(); } catch (x) { setErr(x.message); } };
  return (
    <Modal title={`Due dates – ${t.name}`} onClose={onClose} wide>
      <p className="muted small">Change the due date for one period for <b>all customers</b> at once, for example when the government extends a deadline. Filed returns are not changed.</p>
      <div className="filters"><select value={fy} onChange={(e) => setFy(e.target.value)}>{fyOptions().map((y) => <option key={y} value={y}>FY {y}</option>)}</select></div>
      <Loading state={s} /><ErrorMsg error={err} />
      {s.data && <table><thead><tr><th>Period</th><th>Standard</th><th>Current due date</th><th>Unfiled</th><th></th></tr></thead><tbody>{s.data.map((p) => (
        <tr key={p.period_label}><td data-label="Period">{p.period_label}</td><td data-label="Standard">{fmtDate(p.standard_due)}</td>
          <td data-label="Current"><b>{fmtDate(p.due_date)}</b>{p.overridden && <span className="chip amber">Extended{p.reason ? `: ${p.reason}` : ''}</span>}</td><td data-label="Unfiled">{p.customers}</td>
          <td className="nowrap"><button className="small" onClick={() => setEdit({ ...p, notify: true, reason: p.reason || '' })}>Change</button>{p.overridden && <> <button className="small" onClick={() => reset(p)}>Reset</button></>}</td></tr>))}</tbody></table>}
      {edit && <Modal title={`${edit.period_label} – new due date`} onClose={() => setEdit(null)}><form onSubmit={save} className="form-grid">
        <Field label="New due date" wide><input type="date" value={edit.due_date} onChange={(e) => setEdit({ ...edit, due_date: e.target.value })} required /></Field>
        <Field label="Reason (shown to customers)" wide><input value={edit.reason} onChange={(e) => setEdit({ ...edit, reason: e.target.value })} placeholder="e.g. Extended by CBDT notification" /></Field>
        <label className="check wide"><input type="checkbox" checked={edit.notify} onChange={(e) => setEdit({ ...edit, notify: e.target.checked })} />Notify affected customers</label>
        <div className="wide"><button className="primary">Apply to all customers</button></div></form></Modal>}
      <Toast msg={toast} />
    </Modal>
  );
}

function RegTypeForm({ t, onClose, onDone }) {
  const [f, setF] = useState(t || { name: '', category: 'Licences', description: '', required_documents: '', timeline: '', fee_note: '', active: true }), [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => { e.preventDefault(); try { t ? await api.put(`/registration-types/${t.id}`, f) : await api.post('/registration-types', f); onDone(); } catch (x) { setErr(x.message); } };
  return (
    <Modal title={t ? 'Edit registration' : 'New registration'} onClose={onClose}>
      <form onSubmit={submit} className="form-grid">
        <Field label="Name" wide><input value={f.name} onChange={set('name')} required /></Field>
        <Field label="Category"><input value={f.category} onChange={set('category')} list="regcats" required /><datalist id="regcats">{['Company & business', 'Tax registrations', 'Labour', 'Licences'].map((c) => <option key={c} />)}</datalist></Field>
        <Field label="Typical time"><input value={f.timeline || ''} onChange={set('timeline')} /></Field>
        <Field label="Description" wide><textarea value={f.description || ''} onChange={set('description')} /></Field>
        <Field label="Documents required (one per line)" wide><textarea value={f.required_documents || ''} onChange={set('required_documents')} /></Field>
        <Field label="Fee note (shown to customers)" wide><input value={f.fee_note || ''} onChange={set('fee_note')} /></Field>
        <label className="check wide"><input type="checkbox" checked={!!f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />Offered to customers</label>
        <div className="wide"><ErrorMsg error={err} /><button className="primary">Save</button></div>
      </form>
    </Modal>
  );
}

export default function MastersPage() {
  const [tab, setTab] = useState('compliances'), [toast, say] = useToast();
  const types = useLoad(() => api.get('/entity-types'));
  const tpl = useLoad(() => api.get('/templates'));
  const regs = useLoad(() => api.get('/registration-types?all=1'));
  const [edit, setEdit] = useState(null), [dues, setDues] = useState(null), [regEdit, setRegEdit] = useState(null), [q, setQ] = useState('');
  const [gen, setGen] = useState(currentFY());
  const typeName = Object.fromEntries((types.data || []).map((e) => [e.code, e.name]));
  const list = (tpl.data || []).filter((t) => !q || `${t.name} ${t.category}`.toLowerCase().includes(q.toLowerCase()));
  const generate = async () => { try { const r = await api.post('/filings/generate', { fy: gen }); say(`${r.created} filings created for FY ${gen}`); } catch (e) { say(e.message); } };
  const del = async (t) => { if (!confirm(`Remove "${t.name}"? Compliances already generated for customers are kept.`)) return; const r = await api.del(`/templates/${t.id}`); say(r.deactivated ? 'Deactivated (it has filings)' : 'Deleted'); tpl.reload(); };
  const delReg = async (t) => { if (!confirm(`Remove "${t.name}"?`)) return; await api.del(`/registration-types/${t.id}`); regs.reload(); };
  return (
    <>
      <div className="page-head"><div><h1>Compliance master</h1><p className="muted">What each type of institution must file, when it is due, and which registrations you offer</p></div></div>
      <Tabs tabs={[['compliances', 'Compliances & due dates'], ['registrations', 'Registrations offered']]} value={tab} onChange={setTab} />
      {tab === 'compliances' && <>
        <div className="alert info small">Standard due dates are pre-loaded as a starting point. Please verify them each year against the latest notifications, and use <b>Due dates</b> to record extensions for all customers.</div>
        <div className="filters"><input className="grow" placeholder="Search compliances" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="primary" onClick={() => setEdit({})}>New compliance</button>
          <select value={gen} onChange={(e) => setGen(e.target.value)}>{fyOptions().map((y) => <option key={y} value={y}>FY {y}</option>)}</select><button onClick={generate}>Generate filings for year</button></div>
        <Loading state={tpl} />
        {tpl.data && <table><thead><tr><th>Compliance</th><th>Rule</th><th>Applies to</th><th></th></tr></thead><tbody>{list.map((t) => (
          <tr key={t.id}><td data-label="Compliance"><b>{t.name}</b>{!t.active && <span className="chip grey">Inactive</span>}<div className="muted small">{t.category}{t.form_no ? ` · ${t.form_no}` : ''}</div></td>
            <td data-label="Rule">{FREQ[t.frequency]}{['monthly', 'quarterly'].includes(t.frequency) ? `, ${t.due_day}th` + (t.due_offset_months ? ` (+${t.due_offset_months} mo)` : '') : t.schedule?.length ? `: ${t.schedule.map((s) => `${s.day} ${MONTHS[s.month - 1]}`).join(', ')}` : ''}{t.condition && <div className="muted small">{COND[t.condition]}</div>}</td>
            <td data-label="Applies to" className="small">{t.entities.length === types.data?.length ? 'All institutions' : t.entities.map((c) => typeName[c] || c).join(', ')}</td>
            <td className="nowrap"><button className="small" onClick={() => setDues(t)}>Due dates</button> <button className="small" onClick={() => setEdit(t)}>Edit</button> <button className="small danger" onClick={() => del(t)}>Remove</button></td></tr>))}</tbody></table>}
      </>}
      {tab === 'registrations' && <>
        <p><button className="primary" onClick={() => setRegEdit({})}>New registration</button></p>
        <Loading state={regs} />
        {regs.data && (regs.data.length === 0 ? <Empty>None yet.</Empty> : <table><thead><tr><th>Registration</th><th>Category</th><th>Typical time</th><th></th></tr></thead><tbody>{regs.data.map((t) => (
          <tr key={t.id}><td data-label="Registration"><b>{t.name}</b>{!t.active && <span className="chip grey">Hidden</span>}</td><td data-label="Category">{t.category}</td><td data-label="Time">{t.timeline || '–'}</td>
            <td className="nowrap"><button className="small" onClick={() => setRegEdit(t)}>Edit</button> <button className="small danger" onClick={() => delReg(t)}>Remove</button></td></tr>))}</tbody></table>)}
      </>}
      {edit && types.data && <TemplateForm t={edit.id ? edit : null} types={types.data} onClose={() => setEdit(null)} onDone={(r) => { setEdit(null); tpl.reload(); say(`Saved${r.filings_created ? ` – ${r.filings_created} filings added for customers` : ''}${r.due_dates_updated ? `, ${r.due_dates_updated} due dates updated` : ''}`); }} />}
      {dues && <DueDates t={dues} onClose={() => setDues(null)} />}
      {regEdit && <RegTypeForm t={regEdit.id ? regEdit : null} onClose={() => setRegEdit(null)} onDone={() => { setRegEdit(null); regs.reload(); say('Saved'); }} />}
      <Toast msg={toast} />
    </>
  );
}
