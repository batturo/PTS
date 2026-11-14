import { useState } from 'react';
import { post, put, del } from '../api.js';
import { useData, Page, Modal, Loading, Badge, run, confirmDo } from '../ui.jsx';
import StopsEditor from './StopsEditor.jsx';

export default function BusRoutes() {
  const [rows, reload] = useData('/transport/routes');
  const [users] = useData('/users?role=driver');
  const [edit, setEdit] = useState(null);
  const save = async (e) => {
    e.preventDefault();
    const body = { route_no: edit.route_no, route_name: edit.route_name, bus_no: edit.bus_no, driver_user_id: edit.driver_user_id || null, stops: edit.stops };
    if (await run(() => edit.id ? put(`/transport/routes/${edit.id}`, body) : post('/transport/routes', body), 'Route saved')) { setEdit(null); reload(); }
  };
  return (<Page title="Bus Routes" sub="Manage routes, buses and driver assignments. Assign students to a route from the Students page."
    actions={<button className="btn" onClick={() => setEdit({ stops: [] })}>＋ Add route</button>}>
    {!rows ? <Loading /> : <div className="card flush"><div className="table-wrap"><table>
      <thead><tr><th>Route</th><th>Bus</th><th>Driver</th><th className="num">Stops</th><th className="num">Students</th><th>Status</th><th /></tr></thead>
      <tbody>{rows.map(r => <tr key={r.id}><td><b>{r.route_no}</b><div className="small muted">{r.route_name}</div></td><td>{r.bus_no}</td><td>{r.driver_name || <span className="muted">Unassigned</span>}</td>
        <td className="num">{r.stops.length}</td><td className="num">{r.students}</td><td>{r.trip_active ? <Badge tone="ok">● Live</Badge> : <Badge>Idle</Badge>}</td>
        <td className="nowrap right"><button className="btn sm secondary" onClick={() => setEdit(r)}>Edit</button>{' '}
          <button className="btn sm ghost" onClick={async () => { if (confirmDo(`Delete route ${r.route_no}?`) && await run(() => del(`/transport/routes/${r.id}`), 'Deleted')) reload(); }}>🗑</button></td></tr>)}</tbody></table>
      {!rows.length && <div className="empty">No routes yet.</div>}</div></div>}
    {edit && <Modal wide title={edit.id ? `Route ${edit.route_no}` : 'Add route'} onClose={() => setEdit(null)} footer={<button className="btn" form="rf">Save</button>}>
      <form id="rf" className="stack" onSubmit={save}><div className="form-grid">
        <label className="f">Route number *<input value={edit.route_no || ''} disabled={!!edit.id} onChange={(e) => setEdit({ ...edit, route_no: e.target.value.toUpperCase() })} required /></label>
        <label className="f">Route name<input value={edit.route_name || ''} onChange={(e) => setEdit({ ...edit, route_name: e.target.value })} /></label>
        <label className="f">Bus no.<input value={edit.bus_no || ''} onChange={(e) => setEdit({ ...edit, bus_no: e.target.value.toUpperCase() })} /></label>
        <label className="f">Driver<select value={edit.driver_user_id || ''} onChange={(e) => setEdit({ ...edit, driver_user_id: e.target.value })}><option value="">Unassigned</option>{(users || []).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
      </div><h3>Stops</h3><StopsEditor stops={edit.stops} onChange={(stops) => setEdit({ ...edit, stops })} /></form></Modal>}
  </Page>);
}
