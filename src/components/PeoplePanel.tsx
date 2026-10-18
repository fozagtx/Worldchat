import { useEffect, useMemo, useRef, useState } from "react";
import type { Peer, Profile } from "../lib/protocol";
import type { ConnState } from "../lib/presence";
import { distanceKm, formatKm, isAwake, localTime } from "../lib/geo";
import Avatar from "./Avatar";
import { LinkIcon, Logo, Phone, Search } from "./icons";

interface Props {
  me: Profile;
  peers: Peer[];
  conn: ConnState;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCall: (p: Peer) => void;
  onEditProfile: () => void;
}

type Filter = "all" | "awake" | "far";

export default function PeoplePanel({ me, peers, conn, selectedId, onSelect, onCall, onEditProfile }: Props) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [copied, setCopied] = useState(false);
  const [, tick] = useState(0);
  const [heroIdx, setHeroIdx] = useState(0);
  const rows = useRef(new Map<string, HTMLLIElement>());

  useEffect(() => {
    const t = window.setInterval(() => tick((n) => n + 1), 30000);
    return () => window.clearInterval(t);
  }, []);
  useEffect(() => {
    if (peers.length < 2) return;
    const t = window.setInterval(() => setHeroIdx((i) => i + 1), 3200);
    return () => window.clearInterval(t);
  }, [peers.length]);
  useEffect(() => {
    if (selectedId) rows.current.get(selectedId)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedId]);

  const enriched = useMemo(
    () =>
      peers
        .map((p) => ({ p, km: distanceKm(me.lat, me.lng, p.lat, p.lng) }))
        .sort((a, b) => Number(a.p.status === "busy") - Number(b.p.status === "busy") || b.km - a.km),
    [peers, me.lat, me.lng],
  );
  const shown = enriched.filter(({ p, km }) => {
    if (filter === "awake" && !isAwake(p.tz)) return false;
    if (filter === "far" && km < 3000) return false;
    const s = q.trim().toLowerCase();
    return !s || `${p.name} ${p.city} ${p.country}`.toLowerCase().includes(s);
  });

  const available = peers.filter((p) => p.status === "available");
  const hero = available.length ? available[heroIdx % available.length] : null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(location.origin);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <aside className="panel">
      <header className="panel-head">
        <div className="brand">
          <Logo />
          <span className="serif">Worldchat</span>
        </div>
        <span className={`conn conn-${conn}`} title={conn === "online" ? "Connected" : conn === "connecting" ? "Connecting" : "Offline — retrying"}>
          <i /> {conn === "online" ? "Live" : conn === "connecting" ? "Connecting" : "Reconnecting"}
        </span>
      </header>

      <h1 className="hero serif">
        Say hello to{" "}
        {hero ? (
          <button key={hero.id} className="pill pill-person" onClick={() => onSelect(hero.id)}>
            <Avatar name={hero.name} color={hero.color} size={28} />
            {hero.name} in {hero.city}
          </button>
        ) : (
          <span className="pill pill-quiet">anyone, anywhere</span>
        )}{" "}
        right now.
      </h1>

      <div className="stack-row">
        <div className="stack">
          {available.slice(0, 4).map((p) => (
            <Avatar key={p.id} name={p.name} color={p.color} size={26} ring />
          ))}
        </div>
        <span className="mono tiny">
          {peers.length === 0 ? "NO ONE ELSE ONLINE" : `${peers.length} ONLINE · ${available.length} FREE TO TALK`}
        </span>
      </div>

      {peers.length > 0 && (
        <>
          <div className="search">
            <Search />
            <input className="field bare" placeholder="Search people or cities" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="chips" role="tablist">
            {(
              [
                ["all", "Everyone"],
                ["awake", "Awake now"],
                ["far", "Far away"],
              ] as [Filter, string][]
            ).map(([k, label]) => (
              <button key={k} role="tab" aria-selected={filter === k} className={`chip ${filter === k ? "on" : ""}`} onClick={() => setFilter(k)}>
                {label}
              </button>
            ))}
          </div>
        </>
      )}

      <ul className="people">
        {shown.map(({ p, km }) => (
          <li
            key={p.id}
            ref={(n) => {
              if (n) rows.current.set(p.id, n);
              else rows.current.delete(p.id);
            }}
            className={`person ${selectedId === p.id ? "on" : ""}`}
            onClick={() => onSelect(p.id)}
          >
            <Avatar name={p.name} color={p.color} size={40} />
            <div className="person-meta">
              <strong>{p.name}</strong>
              <span className="muted">
                {p.city}
                {p.country && p.country !== p.city ? `, ${p.country}` : ""}
              </span>
              <span className="mono tiny">
                {localTime(p.tz)} THERE · {formatKm(km).toUpperCase()}
              </span>
            </div>
            {p.status === "busy" ? (
              <span className="busy mono tiny">ON A CALL</span>
            ) : (
              <button
                className="btn btn-ink btn-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onCall(p);
                }}
                aria-label={`Call ${p.name}`}
              >
                <Phone /> Call
              </button>
            )}
          </li>
        ))}
      </ul>

      {peers.length === 0 && (
        <div className="empty">
          <p className="serif">It's just you on the globe for now.</p>
          <p className="muted">Anyone who opens this link appears here with their city. Send it to a friend in another country and call them.</p>
        </div>
      )}
      {peers.length > 0 && shown.length === 0 && <p className="note center">No one matches that.</p>}

      <footer className="panel-foot">
        <button className="me" onClick={onEditProfile} title="Edit profile">
          <Avatar name={me.name} color={me.color} size={30} />
          <span>
            <strong>{me.name}</strong>
            <span className="muted">{me.city}</span>
          </span>
        </button>
        <button className="btn btn-outline btn-sm" onClick={copy}>
          <LinkIcon /> {copied ? "Copied" : "Invite"}
        </button>
      </footer>
    </aside>
  );
}
