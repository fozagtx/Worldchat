import { useEffect, useState } from "react";
import type { Gender, Profile, Seeking } from "../lib/protocol";
import { INTERESTS, randomName, randomSeed } from "../lib/identity";
import { browserTz, getPosition, locate, type Located } from "../lib/geo";
import { cityForTz } from "../lib/cities";
import Avatar from "./Avatar";
import Flag from "./Flag";
import { Arrow, Locate } from "./icons";

interface Props {
  initial: Profile | null;
  onDone: (p: Profile, intent: "match" | "browse") => void;
  onCancel?: () => void;
}

function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map(([v, l]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} className={value === v ? "on" : ""} onClick={() => onChange(v)}>
          {l}
        </button>
      ))}
    </div>
  );
}

export default function Welcome({ initial, onDone, onCancel }: Props) {
  const [name, setName] = useState(initial?.name ?? randomName());
  const [avatar, setAvatar] = useState(initial?.avatar ?? randomSeed());
  const [gender, setGender] = useState<Gender>(initial?.gender ?? "x");
  const [seeking, setSeeking] = useState<Seeking>(initial?.seeking ?? "any");
  const [interests, setInterests] = useState<string[]>(initial?.interests ?? []);
  const [place, setPlace] = useState<Located | null>(initial ? { city: initial.city, country: initial.country, cc: initial.cc, lat: initial.lat, lng: initial.lng } : null);
  const [precise, setPrecise] = useState(false);
  const [locating, setLocating] = useState(!initial);

  useEffect(() => {
    if (initial) return;
    let live = true;
    void locate().then((p) => {
      if (!live) return;
      if (p) setPlace(p);
      else {
        const c = cityForTz(browserTz());
        setPlace({ city: c.city, country: c.country, cc: c.cc, lat: c.lat, lng: c.lng });
      }
      setLocating(false);
    });
    return () => {
      live = false;
    };
  }, [initial]);

  const usePrecise = async () => {
    setLocating(true);
    try {
      const pos = await getPosition();
      const p = await locate(pos.coords.latitude, pos.coords.longitude);
      setPlace(p ?? { ...(place as Located), lat: pos.coords.latitude, lng: pos.coords.longitude });
      setPrecise(true);
    } catch {
      /* keep approximate */
    } finally {
      setLocating(false);
    }
  };

  const toggle = (i: string) => setInterests((cur) => (cur.includes(i) ? cur.filter((x) => x !== i) : cur.length >= 5 ? cur : [...cur, i]));
  const nameOk = name.trim().length > 0 && name.trim().length <= 24;

  const submit = (intent: "match" | "browse") => {
    if (!place || !nameOk) return;
    onDone({ name: name.trim(), avatar, color: "#8a5a3b", gender, seeking, interests, city: place.city, country: place.country, cc: place.cc, lat: place.lat, lng: place.lng, tz: browserTz() }, intent);
  };

  return (
    <div className="veil">
      <div className="welcome" role="dialog" aria-label="Get started">
        <div className="who">
          <button type="button" className="who-face" onClick={() => setAvatar(randomSeed())} title="New face">
            <Avatar seed={avatar} size={64} />
            <span className="mono">↻</span>
          </button>
          <div className="who-name">
            <span className="mono tiny">YOU'LL APPEAR AS</span>
            <div className="who-row">
              <input className="name-input serif" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} aria-label="Display name" />
              <button type="button" className="mini" onClick={() => setName(randomName())}>
                Shuffle
              </button>
            </div>
          </div>
        </div>

        <div className="where">
          <Flag cc={place?.cc ?? ""} />
          <span>{locating ? "Finding your city…" : place ? `${place.city}${place.country && place.country !== place.city ? `, ${place.country}` : ""}` : "Somewhere on Earth"}</span>
          <span className="mono tiny">{precise ? "PRECISE · ROUNDED ~10 KM" : "APPROX."}</span>
          {!precise && !locating && (
            <button type="button" className="mini" onClick={usePrecise}>
              <Locate /> Use precise
            </button>
          )}
        </div>

        <label className="mono tiny">I AM</label>
        <Seg label="I am" value={gender} onChange={setGender} options={[["m", "Man"], ["f", "Woman"], ["x", "Rather not say"]]} />
        <label className="mono tiny">TALK TO</label>
        <Seg label="Talk to" value={seeking} onChange={setSeeking} options={[["any", "Anyone"], ["m", "Men"], ["f", "Women"]]} />
        <label className="mono tiny">
          INTERESTS <span className="muted">· OPTIONAL, UP TO 5</span>
        </label>
        <div className="tags">
          {INTERESTS.map((i) => (
            <button key={i} type="button" className={`tag ${interests.includes(i) ? "on" : ""}`} onClick={() => toggle(i)}>
              {i}
            </button>
          ))}
        </div>

        <div className="welcome-actions">
          <button className="btn btn-ink btn-xl" disabled={!place || !nameOk} onClick={() => submit("match")}>
            {initial ? "Save" : "Match me now"} <Arrow />
          </button>
          {!initial ? (
            <button className="btn btn-outline btn-xl" disabled={!place || !nameOk} onClick={() => submit("browse")}>
              I'll pick on the globe
            </button>
          ) : (
            onCancel && (
              <button className="btn btn-ghost" onClick={onCancel}>
                Cancel
              </button>
            )
          )}
        </div>
        <p className="fineprint">No sign-up. Only your city is shown, rounded to ~10 km. Your camera turns on only when a call starts.</p>
      </div>
    </div>
  );
}
