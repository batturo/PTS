import { useState } from 'react';
import { useData, Page, Loading, Badge, inr, monthLabel } from '../ui.jsx';
import Payslip from './Payslip.jsx';
export default function MyPayslips() {
  const [rows] = useData('/payroll/my');
  const [view, setView] = useState(null);
  return (<Page title="My Payslips" sub="Salary slips processed by the accounts office.">
    {!rows ? <Loading /> : !rows.length ? <div className="card empty">No payslips yet. If you expected one, ask the accountant to link your login to your employee record.</div> :
      <div className="card flush"><div className="table-wrap"><table><thead><tr><th>Month</th><th className="num">Gross</th><th className="num">Deductions</th><th className="num">Net pay</th><th>Status</th><th /></tr></thead>
        <tbody>{rows.map(p => <tr key={p.id}><td>{monthLabel(p.month)}</td><td className="num">{inr(p.gross)}</td><td className="num">{inr(p.total_deductions)}</td><td className="num"><b>{inr(p.net_pay)}</b></td><td><Badge>{p.status}</Badge></td>
          <td className="right"><button className="btn sm secondary" onClick={() => setView(p)}>View</button></td></tr>)}</tbody></table></div></div>}
    {view && <Payslip p={view} onClose={() => setView(null)} />}
  </Page>);
}
