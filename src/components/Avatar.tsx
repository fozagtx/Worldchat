import { initials } from "../lib/profile";
export default function Avatar({ name, color, size = 40, ring = false }: { name: string; color: string; size?: number; ring?: boolean }) {
  return (
    <span className={`avatar ${ring ? "avatar-ring" : ""}`} style={{ width: size, height: size, fontSize: size * 0.38, ["--c" as string]: color }}>
      {initials(name)}
    </span>
  );
}
