import type { Peer, Profile } from "../lib/protocol";
import { distanceKm, formatKm, localTime } from "../lib/geo";
import Avatar from "./Avatar";
import Flag from "./Flag";
import { Close, Phone } from "./icons";

interface Props {
  me: Profile;
  peer: Peer;
  position: number | undefined;
  onCall: () => void;
  onKnock: () => void;
  onLeaveQueue: () => void;
  onClose: () => void;
}

export default function PersonCard({ me, peer, position, onCall, onKnock, onLeaveQueue, onClose }: Props) {
  const shared = peer.interests.filter((i) => me.interests.includes(i));
  const status = peer.status === "available" ? "Free to talk" : peer.status === "busy" ? "On a call" : "Looking for a match";
  return (
    <div className="card person-card" role="dialog" aria-label={peer.name}>
      <button className="icon-btn pc-close" onClick={onClose} aria-label="Close">
        <Close />
      </button>
      <div className="pc-top">
        <Avatar seed={peer.avatar} size={56} />
        <div>
          <strong className="serif">{peer.name}</strong>
          <span className="pc-loc">
            <Flag cc={peer.cc} /> {peer.city}
            {peer.country && peer.country !== peer.city ? `, ${peer.country}` : ""}
          </span>
          <span className="mono tiny">
            {localTime(peer.tz).toUpperCase()} THERE · {formatKm(distanceKm(me.lat, me.lng, peer.lat, peer.lng)).toUpperCase()}
          </span>
        </div>
      </div>
      <div className="pc-meta">
        <span className={`status-pill s-${peer.status}`}>
          <i /> {status}
        </span>
        {peer.interests.map((i) => (
          <span key={i} className={`tag sm ${shared.includes(i) ? "on" : ""}`}>
            {i}
          </span>
        ))}
      </div>
      {peer.status === "available" ? (
        <button className="btn btn-ink wide" onClick={onCall}>
          <Phone /> Video call {peer.name.split(" ")[0]}
        </button>
      ) : position ? (
        <div className="queued">
          <span>
            You're <b>#{position}</b> in line — we'll ring them the moment they're free.
          </span>
          <button className="mini" onClick={onLeaveQueue}>
            Leave line
          </button>
        </div>
      ) : (
        <button className="btn btn-outline wide" onClick={onKnock}>
          Knock & wait in line
        </button>
      )}
    </div>
  );
}
