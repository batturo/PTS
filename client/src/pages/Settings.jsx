import { useEffect, useState } from 'react';
import { put } from '../api.js';
import { useData, Page, Loading, run } from '../ui.jsx';

const GROUPS = [
  ['School', [['school_name', 'School name'], ['school_address', 'Address'], ['academic_year', 'Academic year']]],
  ['Fees', [['fee_fine_per_day', 'Late fee per day (₹)'], ['fee_fine_cap', 'Maximum late fee per invoice (₹)']]],
  ['Library', [['library_issue_days', 'Default issue period (days)'], ['library_fine_per_day', 'Late return fine per day (₹)'], ['library_max_books', 'Max books per student']]],
  ['Payroll (statutory)', [['pf_rate', 'EPF rate (%)'], ['pf_wage_ceiling', 'EPF wage ceiling (₹)'], ['esi_employee_rate', 'ESI employee rate (%)'], ['esi_employer_rate', 'ESI employer rate (%)'],
    ['esi_wage_limit', 'ESI applicable up to gross (₹)'], ['pt_amount', 'Professional Tax per month (₹)'], ['pt_threshold', 'Professional Tax applies above gross (₹)'], ['ot_multiplier', 'Overtime multiplier (× hourly rate)']]],
];
export default function Settings() {
  const [data] = useData('/settings');
  const [f, setF] = useState(null);
  useEffect(() => { if (data) setF(data); }, [data]);
  if (!f) return <Loading />;
  return (<Page title="School Settings" sub="These values drive fee fines, library rules and payroll calculations.">
    <form className="stack" onSubmit={(e) => { e.preventDefault(); run(() => put('/settings', f), 'Settings saved'); }}>
      {GROUPS.map(([g, items]) => <div className="card" key={g}><h2>{g}</h2><div className="form-grid">
        {items.map(([k, l]) => <label className="f" key={k}>{l}<input value={f[k] ?? ''} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></label>)}</div></div>)}
      <div className="small muted">Professional Tax slabs differ by state (e.g. Maharashtra ₹200/₹300, Karnataka ₹200, Delhi has none). Set the amount for your state, or 0.</div>
      <div><button className="btn">Save settings</button></div>
    </form>
  </Page>);
}
