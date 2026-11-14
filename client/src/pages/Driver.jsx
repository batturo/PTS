import { useEffect, useRef, useState } from 'react';
import { post, put } from '../api.js';
import { useData, Page, Loading, Badge, run, useAuth } from '../ui.jsx';
import BusMap from './BusMap.jsx';
import StopsEditor from './StopsEditor.jsx';
import { watchPosition } from './geo.js';

export default function Driver() {
  const { user } = useAuth();
  const [route, reload] = useData('/transport/my-route');
  const [form, setForm] = useState(null);
  const [sharing, setSharing] = useState(false);
  const [pos, setPos] = useState(null);
  const [sent, setSent] = useState({ count: 0, at: null, error: '' });
  const stopRef = useRef(null), lastSent = useRef(0), wake = useRef(null);

  useEffect(() => { if (route !== null && route !== undefined) setForm({ route_no: route.route_no, route_name: route.route_name || '', bus_no: route.bus_no || '', stops: route.stops }); else if (route === null) setForm({ route_no: '', route_name: '', bus_no: '', stops: [] }); }, [route]);
  useEffect(() => () => { stopRef.current?.(); wake.current?.release?.(); }, []);

  const saveRoute = async (e) => { e.preventDefault(); if (await run(() => put('/transport/my-route', form), 'Route saved')) reload(); };

  const start = async (trip_type) => {
    if (!(await run(() => post('/transport/trip', { active: true, trip_type })))) return;
    try {
      stopRef.current = await watchPosition(async (p) => {
        setPos(p);
        if (Date.now() - lastSent.current < 4000) return; // send at most every 4 seconds
        lastSent.current = Date.now();
        try { await post('/transport/location', p); setSent(s => ({ count: s.count + 1, at: new Date(), error: '' })); }
        catch (err) { setSent(s => ({ ...s, error: err.message })); }
      }, (err) => setSent(s => ({ ...s, error: err.message })));
      setSharing(trip_type);
      try { wake.current = await navigator.wakeLock?.request('screen'); } catch { /* optional */ }
    } catch (err) { run(() => Promise.reject(err)); }
  };
  const stop = async () => {
    stopRef.current?.(); stopRef.current = null; wake.current?.release?.(); setSharing(false);
    await run(() => post('/transport/trip', { active: false }), 'Trip ended – location sharing stopped'); reload();
  };

  if (route === undefined || !form) return <Loading />;
  return (<Page title="My Route & Live Location" sub={user.role === 'admin' ? 'As administrator you can also manage all routes under Bus Routes.' : 'Set your route and share your live location with students on your route.'}>
    <div className="card stack">
      <div className="row"><h2 style={{ margin: 0 }}>Live location sharing</h2><div className="spacer" />{sharing ? <Badge tone="ok">{`● LIVE – ${sharing}`}</Badge> : <Badge>Not sharing</Badge>}</div>
      {!route ? <div className="alert info">Save your route below before starting a trip.</div> : !sharing ? <div className="row">
        <button className="btn ok" onClick={() => start('Morning pickup')}>▶ Start morning pickup</button><button className="btn ok" onClick={() => start('Afternoon drop')}>▶ Start afternoon drop</button></div>
        : <div className="row"><button className="btn danger" onClick={stop}>■ End trip</button><span className="small muted">Updates sent: {sent.count}{sent.at && ` · last ${sent.at.toLocaleTimeString('en-IN')}`}{pos?.speed != null && ` · ${pos.speed} km/h`}</span></div>}
      {sent.error && <div className="alert">{sent.error}</div>}
      {sharing && <div className="small muted">Keep this screen open while driving. Students on route <b>{route.route_no}</b> ({route.students} students) can now see the bus on their map.</div>}
      {route && <BusMap stops={form.stops} bus={pos || (route.lat != null ? route : null)} height={320} />}
    </div>
    <form className="card stack" onSubmit={saveRoute}>
      <h2 style={{ margin: 0 }}>Route details</h2>
      <div className="form-grid">
        <label className="f">Route number *<input value={form.route_no} onChange={(e) => setForm({ ...form, route_no: e.target.value.toUpperCase() })} required placeholder="e.g. R1" /></label>
        <label className="f">Route name<input value={form.route_name} onChange={(e) => setForm({ ...form, route_name: e.target.value })} placeholder="e.g. Green Park – Saket" /></label>
        <label className="f">Bus registration no.<input value={form.bus_no} onChange={(e) => setForm({ ...form, bus_no: e.target.value.toUpperCase() })} placeholder="DL 1PC 4521" /></label>
      </div>
      <h3>Stops (in order)</h3>
      <StopsEditor stops={form.stops} onChange={(stops) => setForm({ ...form, stops })} />
      <div><button className="btn">Save route</button></div>
    </form>
  </Page>);
}
