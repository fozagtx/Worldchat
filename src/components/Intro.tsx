import { useEffect, useRef, useState } from "react";
import Orbit from "./Orbit";

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

  return (
    <div className={`intro is-${phase}`} aria-label="Loading Worldchat" role="status">
      <div className="intro-core">
        <Orbit size={200} progress={pct / 100} text={RING} glow="strong" tone="cream" className="orbit-intro" />
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
