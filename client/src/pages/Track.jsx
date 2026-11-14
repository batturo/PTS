import { useEffect, useState } from 'react';
import { get } from '../api.js';
import { useAuth, useData, Page, Loading, Badge, fmtDate } from '../ui.jsx';
import BusMap, { km } from './BusMap.jsx';

export default function Track() {
  const { user, student } = useAuth();
  const family = ['student', 'parent'].includes(user.role);
  const [routes] = useData(family ? null : '/transport/routes');
  const [routeNo, setRouteNo] = useState('');
  const [r, setR] = useState(undefined);
  useEffect(() => {
    if (!family && !routeNo) { setR(null); return; }
    let on = true;
    const tick = () => get('/transport/track' + (family ? '' : `?route_no=${encodeURIComponent(routeNo)}`)).then(d => on && setR(d)).catch(() => {});
    tick(); const id = setInterval(tick, 5000); // refresh every 5 seconds
    return () => { on = false; clearInterval(id); };
  }, [routeNo, family]);

  const age = r?.location_updated_at ? (Date.now() - new Date(r.location_updated_at.replace(' ', 'T') + 'Z')) / 1000 : null;
  const live = r?.trip_active && age != null && age < 120;
  const stops = r?.stops || [];
  const bus = r?.lat != null ? { lat: r.lat, lng: r.lng } : null;
  const nearest = bus && stops.filter(s => s.lat != null).map((s, i) => ({ ...s, i, d: km(bus, s) })).sort((a, b) => a.d - b.d)[0];

  return (<Page title="Bus Tracking" sub={family ? (student.route_no ? `Route ${student.route_no}` : 'Not using school transport') : 'View the live location of any school bus'}>
    {!family && <select style={{ maxWidth: 320 }} value={routeNo} onChange={(e) => setRouteNo(e.target.value)}><option value="">Choose a route</option>{(routes || []).map(x => <option key={x.id} value={x.route_no}>{x.route_no} – {x.route_name} {x.trip_active ? '🟢' : ''}</option>)}</select>}
    {r === undefined ? <Loading /> : !r ? <div className="card empty">{family ? 'You are not assigned to a school bus route. Contact the school office to opt for transport.' : 'Select a route.'}</div> : r.missing ? <div className="card empty">Route {r.route_no} has not been set up yet.</div> : <>
      <div className="card row">
        <div><div className="row"><b>Route {r.route_no}</b>{live ? <Badge tone="ok">{`● LIVE${r.trip_type ? ` · ${r.trip_type}` : ''}`}</Badge> : <Badge>Not running</Badge>}</div>
          <div className="small muted">{r.route_name} · Bus {r.bus_no || '—'}</div></div><div className="spacer" />
        <div className="right small"><div>Driver: <b>{r.driver_name || '—'}</b></div>{r.driver_phone && <a href={`tel:${r.driver_phone}`}>📞 {r.driver_phone}</a>}</div>
      </div>
      {live && <div className="grid-stats">
        <div className="card stat"><div className="v">{r.speed != null ? `${Math.round(r.speed)} km/h` : '—'}</div><div className="l">Speed</div></div>
        <div className="card stat"><div className="v">{age < 60 ? `${Math.round(age)} s ago` : `${Math.round(age / 60)} min ago`}</div><div className="l">Last update</div></div>
        {nearest && <div className="card stat"><div className="v">{nearest.d < 0.3 ? 'At' : 'Near'} {nearest.name}</div><div className="l">{nearest.d.toFixed(1)} km from stop {nearest.i + 1}</div></div>}
      </div>}
      {!live && r.location_updated_at && <div className="alert info">The bus is not sharing its location right now. Last seen {fmtDate(r.location_updated_at)} {new Date(r.location_updated_at.replace(' ', 'T') + 'Z').toLocaleTimeString('en-IN')}.</div>}
      <BusMap stops={stops} bus={bus} />
      <div className="card flush"><div className="card-head"><b>Stops</b></div><table><tbody>{stops.map((s, i) => <tr key={i}><td style={{ width: 30 }}><Badge tone={nearest?.i === i && live ? 'ok' : 'primary'}>{i + 1}</Badge></td><td>{s.name}</td><td className="right">{s.time}</td></tr>)}</tbody></table></div>
    </>}
  </Page>);
}
