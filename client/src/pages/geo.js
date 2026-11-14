import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

const native = Capacitor.isNativePlatform();
const norm = (c) => ({ lat: c.latitude, lng: c.longitude, speed: c.speed != null ? Math.round(c.speed * 3.6) : null, heading: c.heading ?? null, accuracy: c.accuracy });

export async function currentPosition() {
  if (native) { await Geolocation.requestPermissions(); return norm((await Geolocation.getCurrentPosition({ enableHighAccuracy: true })).coords); }
  if (!navigator.geolocation) throw new Error('Location is not supported on this device');
  return new Promise((ok, fail) => navigator.geolocation.getCurrentPosition((p) => ok(norm(p.coords)), (e) => fail(new Error(e.message || 'Location permission denied')), { enableHighAccuracy: true, timeout: 15000 }));
}

/** Watch the device position. Returns a stop() function. Uses the native GPS plugin inside the Android/iOS app. */
export async function watchPosition(onPos, onErr) {
  if (native) {
    await Geolocation.requestPermissions();
    const id = await Geolocation.watchPosition({ enableHighAccuracy: true }, (p, err) => (err ? onErr(new Error(err.message)) : p && onPos(norm(p.coords))));
    return () => Geolocation.clearWatch({ id });
  }
  if (!navigator.geolocation) throw new Error('Location is not supported on this device');
  const id = navigator.geolocation.watchPosition((p) => onPos(norm(p.coords)), (e) => onErr(new Error(e.message || 'Location permission denied')), { enableHighAccuracy: true, maximumAge: 3000 });
  return () => navigator.geolocation.clearWatch(id);
}
