import { useEffect, useRef, useState } from "react";

interface Props {
  steps: { label: string; done: boolean }[];
  onDone: () => void;
}

const RING = "SAY HELLO TO THE WORLD · LIVE · ";

export default function Intro({ steps, onDone }: Props) {
  const [phase, setPhase] = useState<"load" | "word" | "out">("load");
  const started = useRef(performance.now());
  const done = steps.filter((s) => s.done).length;
  const pct = Math.round((done / steps.length) * 100);
  const current = steps.find((s) => !s.done)?.label ?? "Ready";

  useEffect(() => {
    if (phase !== "load") return;
    const ready = done === steps.length;
    const elapsed = performance.now() - started.current;
    // never block forever on a slow network: go after 9s with whatever is ready
    const wait = ready ? Math.max(0, 1400 - elapsed) : Math.max(0, 9000 - elapsed);
    const t = window.setTimeout(() => setPhase("word"), wait);
    return () => window.clearTimeout(t);
  }, [done, steps.length, phase]);

  useEffect(() => {
    if (phase === "word") {
      const t = window.setTimeout(() => setPhase("out"), 1100);
      return () => window.clearTimeout(t);
    }
    if (phase === "out") {
      onDone();
    }
  }, [phase, onDone]);

  const chars = [...RING.repeat(2)];
  return (
    <div className={`intro is-${phase}`} aria-label="Loading Worldchat" role="status">
      <div className="intro-grid" />
      <div className="intro-core">
        <div className="intro-ring" style={{ ["--p" as string]: pct / 100 }}>
          <svg viewBox="0 0 200 200" className="ring-text" aria-hidden>
            {chars.map((c, i) => (
              <text key={i} x="100" y="100" transform={`rotate(${(i * 360) / chars.length} 100 100) translate(0 -84)`} textAnchor="middle">
                {c}
              </text>
            ))}
          </svg>
          <svg viewBox="0 0 64 64" className="ring-globe" aria-hidden>
            <circle cx="32" cy="32" r="26" />
            <ellipse cx="32" cy="32" rx="11" ry="26" />
            <ellipse cx="32" cy="32" rx="20" ry="26" />
            <path d="M6 32h52M10 19h44M10 45h44" />
          </svg>
          <svg viewBox="0 0 200 200" className="ring-progress" aria-hidden>
            <circle cx="100" cy="100" r="66" pathLength="100" style={{ strokeDashoffset: 100 - pct }} />
          </svg>
        </div>
        <h1 className="intro-word serif">
          {[..."Worldchat"].map((c, i) => (
            <span key={i} style={{ animationDelay: `${i * 45}ms` }}>
              {c}
            </span>
          ))}
        </h1>
        <p className="intro-step mono">
          {String(pct).padStart(3, "0")}% · {current.toUpperCase()}
        </p>
      </div>
    </div>
  );
}
