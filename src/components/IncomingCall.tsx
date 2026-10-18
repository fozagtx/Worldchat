import { useEffect } from "react";
import type { Peer, Profile } from "../lib/protocol";
import { distanceKm, formatKm, localTime } from "../lib/geo";
import Avatar from "./Avatar";
import Flag from "./Flag";
import { Phone, PhoneDown } from "./icons";

function useRingtone() {
  useEffect(() => {
    let ac: AudioContext | null = null;
    try {
      ac = new AudioContext();
    } catch {
      return;
    }
    const ring = () => {
      if (!ac || ac.state !== "running") return;
      [0, 0.22].forEach((off, i) => {
        const o = ac!.createOscillator();
        const g = ac!.createGain();
        o.frequency.value = i ? 784 : 659;
        o.type = "sine";
        g.gain.setValueAtTime(0, ac!.currentTime + off);
        g.gain.linearRampToValueAtTime(0.12, ac!.currentTime + off + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, ac!.currentTime + off + 0.5);
        o.connect(g).connect(ac!.destination);
        o.start(ac!.currentTime + off);
        o.stop(ac!.currentTime + off + 0.55);
      });
    };
    void ac.resume().then(ring).catch(() => {});
    const t = window.setInterval(ring, 2200);
    const title = document.title;
    let flip = false;
    const tt = window.setInterval(() => {
      flip = !flip;
      document.title = flip ? "Incoming call · Worldchat" : title;
    }, 1000);
    return () => {
      window.clearInterval(t);
      window.clearInterval(tt);
      document.title = title;
      void ac?.close();
    };
  }, []);
}

export default function IncomingCall({ me, peer, onAccept, onDecline }: { me: Profile; peer: Peer; onAccept: () => void; onDecline: () => void }) {
  useRingtone();
  return (
    <div className="incoming" role="alertdialog" aria-label={`Incoming call from ${peer.name}`}>
      <div className="pulse ringing">
        <Avatar seed={peer.avatar} size={52} />
      </div>
      <div className="incoming-meta">
        <span className="mono tiny">INCOMING CALL</span>
        <strong className="serif">{peer.name}</strong>
        <span className="muted">
          <Flag cc={peer.cc} /> {peer.city} · {localTime(peer.tz)} · {formatKm(distanceKm(me.lat, me.lng, peer.lat, peer.lng))}
        </span>
      </div>
      <div className="incoming-actions">
        <button className="round end sm" onClick={onDecline} aria-label="Decline">
          <PhoneDown />
        </button>
        <button className="round accept sm" onClick={onAccept} aria-label="Accept">
          <Phone />
        </button>
      </div>
    </div>
  );
}
