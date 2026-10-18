import { createAvatar } from "@dicebear/core";
import { notionists } from "@dicebear/collection";

const ADJ = ["blue", "plum", "emerald", "amber", "coral", "olive", "rusty", "golden", "misty", "sunny", "velvet", "copper", "ivory", "cocoa", "mint", "honey", "maple", "sage", "cinnamon", "pearl"];
const ANIMALS = ["moose", "whale", "muskox", "otter", "fox", "panda", "heron", "lynx", "koala", "gecko", "falcon", "bison", "llama", "badger", "puffin", "tapir", "walrus", "ibex", "quokka", "manatee"];
const BG = ["f3e3cf", "ead7c0", "e7dccb", "efd2bf", "dfe2cf", "e9dbe6", "d9e1e6", "f1e0b8"];

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
export const randomName = () => `${pick(ADJ)} ${pick(ANIMALS)}`;
export const randomSeed = () => Math.random().toString(36).slice(2, 10);

const cache = new Map<string, string>();
export function avatarUrl(seed: string) {
  let url = cache.get(seed);
  if (!url) {
    const bg = BG[[...seed].reduce((n, ch) => n + ch.charCodeAt(0), 0) % BG.length];
    url = createAvatar(notionists, { seed, backgroundColor: [bg], radius: 50 }).toDataUri();
    cache.set(seed, url);
  }
  return url;
}

export function flagUrl(cc: string) {
  return cc && /^[A-Z]{2}$/.test(cc) ? `https://flagcdn.com/w40/${cc.toLowerCase()}.png` : "";
}

export const INTERESTS = ["music", "gaming", "travel", "football", "tech", "art", "movies", "languages", "food", "anime", "startups", "fashion", "books", "fitness"];
