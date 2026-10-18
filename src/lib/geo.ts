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

export async function reverseGeocode(lat: number, lng: number): Promise<{ city: string; country: string } | null> {
  try {
    const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const j = await res.json();
    const city = j.city || j.locality || j.principalSubdivision || "";
    const country = j.countryName || "";
    if (!city && !country) return null;
    return { city: city || country, country };
  } catch {
    return null;
  }
}

export function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Location isn't available in this browser"));
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: false, timeout: 12000, maximumAge: 600000 });
  });
}
