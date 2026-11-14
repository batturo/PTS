import { Router } from 'express';
import { db } from '../db.js';
import { allow, myStudent } from '../auth.js';
import { bad, notFound, pick, insert, update } from '../util.js';

export const transportRouter = Router();
const parseRoute = (r) => r && ({ ...r, stops: JSON.parse(r.stops || '[]') });
const ROUTE_SQL = `SELECT r.*, u.name AS driver_name, u.phone AS driver_phone,
  (SELECT COUNT(*) FROM students s WHERE s.route_no=r.route_no AND s.active=1) AS students
  FROM bus_routes r LEFT JOIN users u ON u.id=r.driver_user_id`;

function validStops(stops) {
  if (!Array.isArray(stops)) throw bad('Stops must be a list');
  return JSON.stringify(stops.filter(s => s && s.name).map(s => ({ name: String(s.name), time: s.time || '', lat: s.lat === '' || s.lat == null ? null : Number(s.lat), lng: s.lng === '' || s.lng == null ? null : Number(s.lng) })));
}

// Admin manages the fleet; drivers manage their own route.
transportRouter.get('/routes', allow('driver', 'teacher', 'accountant'), (req, res) => res.json(db.prepare(`${ROUTE_SQL} ORDER BY r.route_no`).all().map(parseRoute)));
transportRouter.post('/routes', allow('admin'), (req, res) => {
  const d = pick(req.body, ['route_no', 'route_name', 'bus_no', 'driver_user_id']);
  if (!d.route_no) throw bad('Route number is required');
  if (db.prepare('SELECT 1 FROM bus_routes WHERE route_no=?').get(d.route_no)) throw bad('Route number already exists');
  res.json({ id: insert(db, 'bus_routes', { ...d, stops: validStops(req.body.stops || []) }) });
});
transportRouter.put('/routes/:id', allow('admin'), (req, res) => {
  const d = pick(req.body, ['route_name', 'bus_no', 'driver_user_id']);
  if (req.body.stops) d.stops = validStops(req.body.stops);
  if (!update(db, 'bus_routes', req.params.id, d)) throw notFound('Route');
  res.json({ ok: true });
});
transportRouter.delete('/routes/:id', allow('admin'), (req, res) => { db.prepare('DELETE FROM bus_routes WHERE id=?').run(req.params.id); res.json({ ok: true }); });

// ---------- Driver ----------
const driverRoute = (req) => {
  // Admin can operate any route by passing ?route_id=, drivers get the route assigned to them
  const r = req.user.role === 'admin' && req.query.route_id
    ? db.prepare(`${ROUTE_SQL} WHERE r.id=?`).get(req.query.route_id)
    : db.prepare(`${ROUTE_SQL} WHERE r.driver_user_id=?`).get(req.user.id);
  return parseRoute(r);
};
transportRouter.get('/my-route', allow('driver'), (req, res) => res.json(driverRoute(req) || null));
/** Driver sets their route: claims a route number (creating it if new), bus number and stops. */
transportRouter.put('/my-route', allow('driver'), (req, res) => {
  const { route_no, route_name, bus_no, stops } = req.body;
  if (!route_no) throw bad('Route number is required');
  const existing = db.prepare('SELECT * FROM bus_routes WHERE route_no=?').get(route_no);
  const driverId = req.user.role === 'admin' && existing ? existing.driver_user_id : req.user.id;
  if (existing && existing.driver_user_id && existing.driver_user_id !== driverId) throw bad(`Route ${route_no} is assigned to another driver`);
  if (req.user.role === 'driver') db.prepare('UPDATE bus_routes SET driver_user_id=NULL, trip_active=0 WHERE driver_user_id=? AND route_no!=?').run(req.user.id, route_no);
  const data = { route_name: route_name || null, bus_no: bus_no || null, driver_user_id: driverId, stops: validStops(stops || []) };
  if (existing) update(db, 'bus_routes', existing.id, data); else insert(db, 'bus_routes', { route_no, ...data });
  res.json({ ok: true });
});
transportRouter.post('/trip', allow('driver'), (req, res) => {
  const r = driverRoute(req);
  if (!r) throw bad('Set up your route first');
  db.prepare('UPDATE bus_routes SET trip_active=?, trip_type=? WHERE id=?').run(req.body.active ? 1 : 0, req.body.trip_type || null, r.id);
  res.json({ ok: true });
});
transportRouter.post('/location', allow('driver'), (req, res) => {
  const r = driverRoute(req);
  if (!r) throw bad('Set up your route first');
  const { lat, lng, speed, heading } = req.body;
  if (!(Math.abs(lat) <= 90 && Math.abs(lng) <= 180)) throw bad('Invalid coordinates');
  db.prepare("UPDATE bus_routes SET lat=?, lng=?, speed=?, heading=?, location_updated_at=datetime('now'), trip_active=1 WHERE id=?")
    .run(Number(lat), Number(lng), speed == null ? null : Number(speed), heading == null ? null : Number(heading), r.id);
  res.json({ ok: true });
});

// ---------- Student / parent ----------
transportRouter.get('/track', allow('student', 'parent', 'teacher'), (req, res) => {
  const route_no = ['student', 'parent'].includes(req.user.role) ? myStudent(req).route_no : req.query.route_no;
  if (!route_no) return res.json(null);
  const r = parseRoute(db.prepare(`${ROUTE_SQL} WHERE r.route_no=?`).get(route_no));
  res.json(r || { route_no, missing: true });
});
