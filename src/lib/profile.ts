import type { Profile } from "./protocol";

const KEY = "worldchat.profile.v1";

export const COLORS = ["#8a5a3b", "#c9783f", "#6f7d4f", "#b5523b", "#4f6a7d", "#9a6f9a"];

export function loadProfile(): Profile | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Profile;
    if (!p.name || typeof p.lat !== "number" || typeof p.lng !== "number") return null;
    return p;
  } catch {
    return null;
  }
}

export function saveProfile(p: Profile) {
  localStorage.setItem(KEY, JSON.stringify(p));
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}
