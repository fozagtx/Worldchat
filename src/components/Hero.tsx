import type { Peer, Profile } from "../lib/protocol";
import type { ConnState } from "../lib/presence";
import Avatar from "./Avatar";
import Flag from "./Flag";
import { Logo } from "./icons";

export function TopBar({ me, conn, onEdit }: { me: Profile; conn: ConnState; onEdit: () => void }) {
  return (
    <header className="topbar">
      <span className="brand">
        <Logo />
        <span className="serif">Worldchat</span>
      </span>
      <span className={`live-chip mono ${conn}`}>
        <i /> {conn === "online" ? "LIVE" : conn === "connecting" ? "CONNECTING" : "RECONNECTING"}
      </span>
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
  if (!peers.length)
    return (
      <footer className="ticker">
        <span className="mono tiny ticker-empty">NO ONE ELSE IS ONLINE YET — SHARE THE LINK AND THEY'LL APPEAR HERE</span>
      </footer>
    );
  const scroll = peers.length >= 6;
  const items = peers.map((p) => (
    <button key={p.id} className="tk" onClick={() => onPick(p.id)}>
      <Avatar seed={p.avatar} size={22} />
      <b>{p.name}</b>
      <Flag cc={p.cc} />
      <span>{p.country || p.city}</span>
      <i className={`dot ${p.status === "available" ? "free" : p.status === "busy" ? "talk" : "match"}`} />
    </button>
  ));
  return (
    <footer className="ticker">
      <div className={`tk-track ${scroll ? "scroll" : ""}`} style={scroll ? { animationDuration: `${peers.length * 4}s` } : undefined}>
        {items}
        {scroll && <span aria-hidden className="tk-dup">{items}</span>}
      </div>
    </footer>
  );
}
