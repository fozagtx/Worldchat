const R = 6371;
const rad = (d: number) => (d * Math.PI) / 180;

export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
}

export function localTime(tz: string, now = new Date()) {
  try {
    return now.toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function localHour(tz: string, now = new Date()) {
  try {
    const h = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(now);
    return Number(h);
  } catch {
    return now.getHours();
  }
}

export function isAwake(tz: string) {
  const h = localHour(tz);
  return h >= 8 && h < 23;
}

export function formatKm(km: number) {
  if (km < 1) return "nearby";
  return `${km.toLocaleString("en-US")} km`;
}

export function browserTz() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export interface Located { city: string; country: string; cc: string; lat: number; lng: number }

// Without coordinates this endpoint falls back to an approximate IP-based location.
export async function locate(lat?: number, lng?: number): Promise<Located | null> {
  try {
    const q = lat !== undefined && lng !== undefined ? `latitude=${lat}&longitude=${lng}&` : "";
    const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?${q}localityLanguage=en`);
    if (!res.ok) return null;
    const j = await res.json();
    if (typeof j.latitude !== "number" || typeof j.longitude !== "number") return null;
    const country = j.countryName || "";
    const city = j.city || j.locality || j.principalSubdivision || country;
    if (!city) return null;
    return { city, country, cc: (j.countryCode || "").toUpperCase(), lat: j.latitude, lng: j.longitude };
  } catch {
    return null;
  }
}

export function greatCircle(a: [number, number], b: [number, number], n = 64): [number, number][] {
  const toV = ([lng, lat]: [number, number]) => {
    const la = rad(lat), lo = rad(lng);
    return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
  };
  const A = toV(a), B = toV(b);
  const d = Math.acos(Math.min(1, Math.max(-1, A[0] * B[0] + A[1] * B[1] + A[2] * B[2])));
  if (d < 1e-6) return [a, b];
  const out: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, s1 = Math.sin((1 - t) * d) / Math.sin(d), s2 = Math.sin(t * d) / Math.sin(d);
    const x = s1 * A[0] + s2 * B[0], y = s1 * A[1] + s2 * B[1], z = s1 * A[2] + s2 * B[2];
    out.push([(Math.atan2(y, x) * 180) / Math.PI, (Math.atan2(z, Math.hypot(x, y)) * 180) / Math.PI]);
  }
  return out;
}

export function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Location isn't available in this browser"));
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: false, timeout: 12000, maximumAge: 600000 });
  });
}
