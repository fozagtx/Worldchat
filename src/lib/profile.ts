import type { Profile } from "./protocol";

const KEY = "worldchat.profile.v2";

export function loadProfile(): Profile | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Profile;
    if (!p.name || !p.avatar || typeof p.lat !== "number" || typeof p.lng !== "number") return null;
    return p;
  } catch {
    return null;
  }
}

export function saveProfile(p: Profile) {
  localStorage.setItem(KEY, JSON.stringify(p));
}
