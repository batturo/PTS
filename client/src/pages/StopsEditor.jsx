import { run } from '../ui.jsx';
import { currentPosition } from './geo.js';

export default function StopsEditor({ stops, onChange }) {
  const set = (i, k, v) => { const s = [...stops]; s[i] = { ...s[i], [k]: v }; onChange(s); };
  const here = async (i) => { const p = await run(() => currentPosition(), 'Location captured'); if (p) { const s = [...stops]; s[i] = { ...s[i], lat: +p.lat.toFixed(6), lng: +p.lng.toFixed(6) }; onChange(s); } };
  const move = (i, d) => { const s = [...stops]; [s[i], s[i + d]] = [s[i + d], s[i]]; onChange(s); };
  return (<div className="stack">
    {stops.map((s, i) => <div key={i} className="row" style={{ alignItems: 'flex-end', borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
      <b style={{ width: 22 }}>{i + 1}.</b>
      <label className="f" style={{ flex: '2 1 160px' }}>Stop name<input value={s.name || ''} onChange={(e) => set(i, 'name', e.target.value)} required /></label>
      <label className="f" style={{ flex: '1 1 90px' }}>Time<input type="time" value={s.time || ''} onChange={(e) => set(i, 'time', e.target.value)} /></label>
      <label className="f" style={{ flex: '1 1 100px' }}>Latitude<input type="number" step="any" value={s.lat ?? ''} onChange={(e) => set(i, 'lat', e.target.value)} /></label>
      <label className="f" style={{ flex: '1 1 100px' }}>Longitude<input type="number" step="any" value={s.lng ?? ''} onChange={(e) => set(i, 'lng', e.target.value)} /></label>
      <div className="row" style={{ gap: 2 }}>
        <button type="button" className="btn sm secondary" title="Use my current location" onClick={() => here(i)}>📍</button>
        <button type="button" className="btn sm ghost" disabled={!i} onClick={() => move(i, -1)} aria-label="Move up">↑</button>
        <button type="button" className="btn sm ghost" disabled={i === stops.length - 1} onClick={() => move(i, 1)} aria-label="Move down">↓</button>
        <button type="button" className="btn sm ghost" onClick={() => onChange(stops.filter((_, j) => j !== i))} aria-label="Remove stop">✕</button></div>
    </div>)}
    <div><button type="button" className="btn sm secondary" onClick={() => onChange([...stops, { name: '', time: '' }])}>＋ Add stop</button></div>
    <div className="small muted">Tip: stand at a stop and tap 📍 to save its exact coordinates.</div>
  </div>);
}
