import { avatarUrl } from "../lib/identity";
export default function Avatar({ seed, size = 40, ring = false, alt = "" }: { seed: string; size?: number; ring?: boolean; alt?: string }) {
  return <img className={`avatar ${ring ? "avatar-ring" : ""}`} src={avatarUrl(seed)} width={size} height={size} alt={alt} draggable={false} />;
}
