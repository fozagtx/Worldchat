const R = 6371;
const rad = (d: number) => (d * Math.PI) / 180;

export interface FanOutLocation {
  id: string;
  lat: number;
  lng: number;
}

export interface LiveArcLocation extends FanOutLocation {
  with: string | null;
}

export interface LiveArc {
  id: string;
  fromId: string;
  toId: string;
  from: [number, number];
  to: [number, number];
}

export function liveConnectionPairs(people: readonly LiveArcLocation[]): LiveArc[] {
  const byId = new Map<string, LiveArcLocation>(people.map((person) => [person.id, person] as const));
  const pairs = new Map<string, LiveArc>();
  for (const person of people) {
    if (!person.with) continue;
    const partner = byId.get(person.with);
    if (!partner || partner.id === person.id) continue;
    const [first, second] = person.id.localeCompare(partner.id) < 0 ? [person, partner] : [partner, person];
    const id = JSON.stringify([first.id, second.id]);
    if (pairs.has(id)) continue;
    pairs.set(id, {
      id,
      fromId: first.id,
      toId: second.id,
      from: [first.lng, first.lat],
      to: [second.lng, second.lat],
    });
  }
  return [...pairs.values()];
}

export function fanOutOffsets(locations: readonly FanOutLocation[]) {
  const offsets = new Map(locations.map(({ id }) => [id, { x: 0, y: 0 }]));
  const byId = new Map(locations.map((location) => [location.id, location]));
  const remaining = new Set(byId.keys());
  while (remaining.size) {
    const seedId = remaining.values().next().value;
    if (seedId === undefined) break;
    remaining.delete(seedId);
    const cluster = [byId.get(seedId)!];
    for (let i = 0; i < cluster.length; i++) {
      for (const id of [...remaining]) {
        const candidate = byId.get(id)!;
        const lngDelta = Math.abs((((candidate.lng - cluster[i].lng) + 540) % 360) - 180);
        if (Math.abs(candidate.lat - cluster[i].lat) <= 0.6 && lngDelta <= 0.6) {
          remaining.delete(id);
          cluster.push(candidate);
        }
      }
    }
    if (cluster.length < 2) continue;
    cluster.sort((a, b) => a.id.localeCompare(b.id));
    const radius = Math.max(32, 26 / Math.sin(Math.PI / cluster.length));
    cluster.forEach(({ id }, index) => {
      const angle = -Math.PI / 2 + (index * 2 * Math.PI) / cluster.length;
      offsets.set(id, { x: Math.round(Math.cos(angle) * radius), y: Math.round(Math.sin(angle) * radius) });
    });
  }
  return offsets;
}

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

export function bridgeArc(a: [number, number], b: [number, number], steps = 48, forceBridge = false): [number, number][] {
  const normalizeLng = (lng: number) => ((lng + 180) % 360 + 360) % 360 - 180;
  const startLng = normalizeLng(a[0]);
  const normalizedEndLng = normalizeLng(b[0]);
  const deltaLng = normalizeLng(normalizedEndLng - startLng);
  const distanceLat = rad(b[1] - a[1]);
  const distanceLng = rad(deltaLng);
  const haversine = Math.sin(distanceLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(distanceLng / 2) ** 2;
  const distance = 2 * R * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
  if (distance >= 1500 && !forceBridge) return greatCircle(a, b);

  const endLng = startLng + deltaLng;
  const deltaLat = b[1] - a[1];
  const separation = Math.hypot(deltaLng, deltaLat);
  let perpendicularLng = separation ? -deltaLat / separation : 0;
  let perpendicularLat = separation ? deltaLng / separation : 1;
  if (perpendicularLat > 0 || (perpendicularLat === 0 && perpendicularLng > 0)) {
    perpendicularLng *= -1;
    perpendicularLat *= -1;
  }
  const bulge = Math.max(2.5, separation * 0.5);
  const controlLng = (startLng + endLng) / 2 + perpendicularLng * bulge;
  const controlLat = Math.max(-89.999, Math.min(89.999, (a[1] + b[1]) / 2 + perpendicularLat * bulge));
  const count = Math.max(1, Math.floor(steps));
  const coordinates: [number, number][] = [];
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const inverse = 1 - t;
    const lng = inverse * inverse * startLng + 2 * inverse * t * controlLng + t * t * endLng;
    const lat = inverse * inverse * a[1] + 2 * inverse * t * controlLat + t * t * b[1];
    coordinates.push([normalizeLng(lng), lat]);
  }
  return coordinates;
}

export function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Location isn't available in this browser"));
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: false, timeout: 12000, maximumAge: 600000 });
  });
}
