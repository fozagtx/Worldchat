import type { Profile } from "../lib/protocol";
import { Arrow, Close } from "./icons";

interface Props {
  me: Profile;
  matching: boolean;
  others: number;
  othersMatching: number;
  onMatch: () => void;
  onCancel: () => void;
}

const SEEK = { any: "anyone", m: "a man", f: "a woman" } as const;

export default function MatchBar({ me, matching, others, othersMatching, onMatch, onCancel }: Props) {
  if (matching)
    return (
      <div className="matchbar searching" role="status">
        <span className="radar" />
        <div>
          <strong>Finding you {SEEK[me.seeking]}…</strong>
          <span className="muted">
            {othersMatching > 0 ? `${othersMatching} other${othersMatching === 1 ? "" : "s"} matching right now` : others > 0 ? "You're first in line — pick someone on the globe meanwhile" : "No one else is online yet — share the link"}
          </span>
        </div>
        <button className="icon-btn" onClick={onCancel} aria-label="Stop matching">
          <Close />
        </button>
      </div>
    );
  return (
    <div className="matchbar">
      <button className="btn btn-ink btn-xl" onClick={onMatch}>
        Match me with {SEEK[me.seeking]} <Arrow />
      </button>
      <span className="mono tiny">OR TAP ANYONE ON THE GLOBE</span>
    </div>
  );
}
