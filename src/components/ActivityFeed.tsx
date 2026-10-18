import { useEffect, useState } from "react";
import type { ActivityEvent } from "../lib/protocol";
import Flag from "./Flag";

function ago(at: number, now: number) {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.round(m / 60);
  return `${h} hour${h === 1 ? "" : "s"} ago`;
}

const ICON: Record<ActivityEvent["kind"], string> = { join: "◎", leave: "○", talking: "◉", knock: "◌" };

export default function ActivityFeed({ events }: { events: ActivityEvent[] }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 20000);
    return () => window.clearInterval(t);
  }, []);
  return (
    <section className="card feed" aria-label="Live activity">
      <span className="mono tiny">LIVE ACTIVITY</span>
      {events.length === 0 ? (
        <p className="muted feed-empty">Joins and calls show up here as they happen.</p>
      ) : (
        <ul>
          {events.slice(0, 7).map((e) => (
            <li key={e.id} className={`ev ev-${e.kind}`}>
              <span className="ev-icon">{ICON[e.kind]}</span>
              <div>
                <p>
                  {e.kind === "join" && (
                    <>
                      <b>{e.names[0]}</b> joined from <Flag cc={e.cc} /> <b>{e.city}</b>
                    </>
                  )}
                  {e.kind === "leave" && (
                    <>
                      <b>{e.names[0]}</b> left
                    </>
                  )}
                  {e.kind === "talking" && (
                    <>
                      <b>{e.names[0]}</b> started talking with <b>{e.names[1]}</b>
                    </>
                  )}
                  {e.kind === "knock" && (
                    <>
                      <b>{e.names[0]}</b> knocked for <b>{e.names[1]}</b>
                    </>
                  )}
                </p>
                <span className="muted">{ago(e.at, now)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
