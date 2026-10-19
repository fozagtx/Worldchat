import { useEffect, useRef, useState } from "react";
import type { Peer, Profile } from "../lib/protocol";
import type { ConnState } from "../lib/presence";
import Avatar from "./Avatar";
import Flag from "./Flag";
import { Logo, Music, MusicOff } from "./icons";

export function TopBar({ me, conn, lofiOn, onToggleLofi, onEdit }: { me: Profile; conn: ConnState; lofiOn: boolean; onToggleLofi: () => void; onEdit: () => void }) {
  return (
    <header className="topbar">
      <span className="brand">
        <Logo />
        <span className="serif">Worldchat</span>
      </span>
      <span className={`live-chip mono ${conn}`}>
        <i /> {conn === "online" ? "LIVE" : conn === "connecting" ? "CONNECTING" : "RECONNECTING"}
      </span>
      <button className="music-toggle" type="button" onClick={onToggleLofi} aria-pressed={lofiOn}>
        {lofiOn ? <Music /> : <MusicOff />}
        {lofiOn ? "Lo-fi on" : "Lo-fi off"}
      </button>
      <span className="spacer" />
      <button className="me-pill" onClick={onEdit} title="Edit your profile">
        <Avatar seed={me.avatar} size={28} />
        <span>{me.name}</span>
      </button>
    </header>
  );
}

export function HeroStats({ me, peers, conn }: { me: Profile; peers: Peer[]; conn: ConnState }) {
  const everyone = [...peers, me];
  const countries = new Set(everyone.map((p) => p.cc || p.country).filter(Boolean)).size;
  const talking = peers.filter((p) => p.status === "busy").length;
  const free = peers.filter((p) => p.status === "available").length;
  const n = (v: number) => (conn === "online" ? v.toLocaleString("en-US") : "–");
  const rows: [string, string][] = [
    ["People live right now", n(everyone.length)],
    ["Countries on the globe", n(countries)],
    ["Free to talk", n(free)],
    ["Talking right now", n(talking)],
  ];
  return (
    <section className="hero-stats" aria-label="Live numbers">
      {rows.map(([k, v], i) => (
        <div key={k} className="hs-row" style={{ animationDelay: `${120 + i * 90}ms` }}>
          <span className="mono">{k}</span>
          <strong className="serif">{v}</strong>
        </div>
      ))}
    </section>
  );
}

export function Ticker({ peers, onPick }: { peers: Peer[]; onPick: (id: string) => void }) {
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [copies, setCopies] = useState(1);
  const [duration, setDuration] = useState(1);
  const measureRef = useRef<HTMLDivElement>(null);
  const sequenceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!peers.length || reducedMotion) {
      setCopies(1);
      return;
    }
    const measure = () => {
      const width = measureRef.current?.getBoundingClientRect().width ?? 0;
      if (!width) return;
      const next = Math.max(2, Math.ceil((window.innerWidth * 2 + 1) / width));
      setCopies((current) => (current === next ? current : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (measureRef.current) observer.observe(measureRef.current);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [peers, reducedMotion]);

  useEffect(() => {
    const width = sequenceRef.current?.getBoundingClientRect().width ?? 0;
    if (width) setDuration(width / 40);
  }, [copies, peers, reducedMotion]);

  if (!peers.length)
    return (
      <footer className="ticker">
        <span className="mono tiny ticker-empty">NO ONE ELSE IS ONLINE YET — SHARE THE LINK AND THEY'LL APPEAR HERE</span>
      </footer>
    );
  const renderCopy = (copy: number, prefix: string, mirror = false) => (
    <div key={`${prefix}-${copy}`} className="tk-copy" aria-hidden={mirror || copy > 0 ? true : undefined}>
      {peers.map((p) => {
        const accessible = !mirror && copy === 0;
        return (
          <button
            key={`${prefix}-${copy}-${p.id}`}
            className="tk"
            onClick={() => onPick(p.id)}
            aria-hidden={accessible ? undefined : true}
            tabIndex={accessible ? undefined : -1}
          >
            <Avatar seed={p.avatar} size={22} />
            <b>{p.name}</b>
            <Flag cc={p.cc} />
            <span>{p.country || p.city}</span>
            <i className={`dot ${p.status === "available" ? "free" : p.status === "busy" ? "talk" : "match"}`} />
          </button>
        );
      })}
    </div>
  );
  return (
    <footer className="ticker">
      <div className={`tk-track ${reducedMotion ? "" : "scroll"}`} style={reducedMotion ? undefined : { animationDuration: `${duration}s` }}>
        <div ref={sequenceRef} className="tk-sequence">
          {Array.from({ length: reducedMotion ? 1 : copies }, (_, copy) => renderCopy(copy, "primary"))}
        </div>
        {!reducedMotion && (
          <div className="tk-sequence" aria-hidden="true">
            {Array.from({ length: copies }, (_, copy) => renderCopy(copy, "mirror", true))}
          </div>
        )}
      </div>
      <div ref={measureRef} className="tk-copy tk-measure" aria-hidden="true">
        {peers.map((p) => (
          <span key={p.id} className="tk">
            <Avatar seed={p.avatar} size={22} />
            <b>{p.name}</b>
            <Flag cc={p.cc} />
            <span>{p.country || p.city}</span>
            <i className={`dot ${p.status === "available" ? "free" : p.status === "busy" ? "talk" : "match"}`} />
          </span>
        ))}
      </div>
    </footer>
  );
}
