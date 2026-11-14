import { useEffect, useRef } from 'react';
import L from 'leaflet';

const icon = (html, size = 30) => L.divIcon({ html, className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
const busIcon = icon('<div style="font-size:26px;filter:drop-shadow(0 2px 3px rgba(0,0,0,.4))">🚌</div>', 32);
const stopIcon = (n) => icon(`<div style="width:22px;height:22px;border-radius:50%;background:#2563eb;color:#fff;font:600 11px Inter,sans-serif;display:grid;place-items:center;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)">${n}</div>`, 22);

/** Leaflet map with route stops and the live bus position (OpenStreetMap tiles). */
export default function BusMap({ stops = [], bus, follow = true, height }) {
  const el = useRef(null), map = useRef(null), layer = useRef(null), busMarker = useRef(null), fitted = useRef(false);
  useEffect(() => {
    map.current = L.map(el.current, { zoomControl: true }).setView([28.6139, 77.209], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    return () => map.current.remove();
  }, []);
  useEffect(() => {
    layer.current.clearLayers();
    const pts = stops.filter(s => s.lat != null && s.lng != null);
    pts.forEach((s, i) => L.marker([s.lat, s.lng], { icon: stopIcon(i + 1) }).bindTooltip(`${s.name}${s.time ? ` · ${s.time}` : ''}`).addTo(layer.current));
    if (pts.length > 1) L.polyline(pts.map(s => [s.lat, s.lng]), { color: '#2563eb', weight: 4, opacity: .5, dashArray: '6 8' }).addTo(layer.current);
    if (!fitted.current && pts.length) { map.current.fitBounds(L.latLngBounds(pts.map(s => [s.lat, s.lng])).pad(0.2)); fitted.current = true; }
  }, [JSON.stringify(stops)]);
  useEffect(() => {
    if (bus?.lat == null) { busMarker.current?.remove(); busMarker.current = null; return; }
    if (!busMarker.current) busMarker.current = L.marker([bus.lat, bus.lng], { icon: busIcon, zIndexOffset: 1000 }).addTo(map.current);
    else busMarker.current.setLatLng([bus.lat, bus.lng]);
    if (follow) map.current.panTo([bus.lat, bus.lng]);
    if (!fitted.current) { map.current.setView([bus.lat, bus.lng], 15); fitted.current = true; }
  }, [bus?.lat, bus?.lng, follow]);
  return <div ref={el} className="map" style={height ? { height } : null} />;
}

/** Distance in km between two coordinates (haversine). */
export function km(a, b) {
  const R = 6371, r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
