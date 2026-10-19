import { useId, type CSSProperties, type ReactNode } from "react";

interface Props {
  size: number;
  progress?: number;
  text?: string;
  glow?: "soft" | "strong";
  tone?: "cream" | "dark";
  center?: ReactNode;
  className?: string;
}

const DEFAULT_TEXT = "SAY HELLO TO THE WORLD · LIVE";

export default function Orbit({
  size,
  progress = 1,
  text = DEFAULT_TEXT,
  glow = "soft",
  tone = "cream",
  center,
  className = "",
}: Props) {
  const id = `orbit-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const fill = Math.max(0, Math.min(1, progress));
  const pathId = `${id}-path`;
  const ringText = `${`${text.trim()} · `.repeat(8)}`;

  return (
    <div
      className={`orbit orbit-${tone} orbit-glow-${glow} ${className}`}
      style={{ "--orbit-size": `${size}px` } as CSSProperties}
      aria-hidden="true"
    >
      <div className="orbit-backdrop" />
      <div className="orbit-core">
        <svg className="orbit-copy" viewBox="0 0 200 200">
          <defs>
            <path id={pathId} d="M 22 100 a 78 78 0 1 1 156 0 a 78 78 0 1 1 -156 0" />
          </defs>
          <g className="orbit-copy-turn">
            <text>
              <textPath href={`#${pathId}`} startOffset="0%">
                {ringText}
              </textPath>
            </text>
          </g>
        </svg>

        <svg className="orbit-ring" viewBox="0 0 200 200">
          <circle className="orbit-ring-halo" cx="100" cy="100" r="69" />
          <circle className="orbit-ring-base" cx="100" cy="100" r="66" pathLength="100" />
          <circle
            className="orbit-ring-progress"
            cx="100"
            cy="100"
            r="66"
            pathLength="100"
            strokeDashoffset={100 - fill * 100}
          />
        </svg>

        <div className="orbit-center">
          {center ?? (
            <svg className="orbit-globe" viewBox="0 0 64 64">
              <circle cx="32" cy="32" r="26" />
              <ellipse className="orbit-meridian orbit-meridian-one" cx="32" cy="32" rx="10" ry="26" />
              <ellipse className="orbit-meridian orbit-meridian-two" cx="32" cy="32" rx="21" ry="26" />
              <path d="M6 32h52M10 19h44M10 45h44" />
            </svg>
          )}
        </div>
      </div>
    </div>
  );
}
