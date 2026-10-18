import { useEffect, useMemo, useState } from "react";
import type { Profile } from "../lib/protocol";
import { COLORS } from "../lib/profile";
import { browserTz, getPosition, reverseGeocode } from "../lib/geo";
import { searchCities, type City } from "../lib/cities";
import Avatar from "./Avatar";
import { Arrow, Locate, Search } from "./icons";

interface Props {
  initial: Profile | null;
  onDone: (p: Profile) => void;
  onCancel?: () => void;
}

type Place = { city: string; country: string; lat: number; lng: number; tz: string };

export default function Onboarding({ initial, onDone, onCancel }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState(initial?.name ?? "");
  const [color, setColor] = useState(initial?.color ?? COLORS[0]);
  const [place, setPlace] = useState<Place | null>(initial ? { city: initial.city, country: initial.country, lat: initial.lat, lng: initial.lng, tz: initial.tz } : null);
  const [q, setQ] = useState("");
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const results = useMemo(() => searchCities(q), [q]);
  const nameOk = name.trim().length > 0 && name.trim().length <= 24;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const locate = async () => {
    setLocating(true);
    setLocError(null);
    try {
      const pos = await getPosition();
      const lat = pos.coords.latitude, lng = pos.coords.longitude;
      const named = await reverseGeocode(lat, lng);
      setPlace({ city: named?.city ?? "Near you", country: named?.country ?? "", lat, lng, tz: browserTz() });
    } catch (e) {
      const denied = (e as GeolocationPositionError)?.code === 1;
      setLocError(denied ? "Location is blocked — pick your city instead." : "Couldn't find you — pick your city instead.");
    } finally {
      setLocating(false);
    }
  };

  const pickCity = (c: City) => {
    setPlace(c);
    setQ("");
  };

  const submit = () => {
    if (!nameOk || !place) return;
    onDone({ name: name.trim(), color, ...place });
  };

  return (
    <div className="scrim">
      <div className="sheet onboarding" role="dialog" aria-labelledby="ob-title">
        <div className="ob-steps mono">
          <span className={step === 1 ? "on" : ""}>01 You</span>
          <span className="ob-line" />
          <span className={step === 2 ? "on" : ""}>02 Where</span>
        </div>

        {step === 1 ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (nameOk) setStep(2);
            }}
          >
            <h2 id="ob-title" className="serif">
              {initial ? "Edit your profile" : <>Say hello to<br />the whole world.</>}
            </h2>
            <p className="muted">Pick a name people will see next to your pin.</p>
            <div className="ob-name">
              <Avatar name={name || "?"} color={color} size={52} />
              <input autoFocus className="field" placeholder="Your first name" maxLength={24} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="swatches" role="radiogroup" aria-label="Avatar colour">
              {COLORS.map((c) => (
                <button type="button" key={c} role="radio" aria-checked={c === color} className={`swatch ${c === color ? "on" : ""}`} style={{ background: c }} onClick={() => setColor(c)} />
              ))}
            </div>
            <div className="ob-actions">
              {onCancel && (
                <button type="button" className="btn btn-ghost" onClick={onCancel}>
                  Cancel
                </button>
              )}
              <button className="btn btn-ink" disabled={!nameOk}>
                Continue <Arrow />
              </button>
            </div>
          </form>
        ) : (
          <div>
            <h2 id="ob-title" className="serif">Where are you calling from?</h2>
            <p className="muted">Only your city shows on the globe, rounded to about 10 km. Nothing is saved on a server.</p>

            {place ? (
              <div className="place-chosen">
                <span className="mono tiny">YOUR PIN</span>
                <strong>{place.city}{place.country ? `, ${place.country}` : ""}</strong>
                <button className="link" onClick={() => setPlace(null)}>Change</button>
              </div>
            ) : (
              <>
                <button className="btn btn-outline wide" onClick={locate} disabled={locating}>
                  <Locate /> {locating ? "Finding you…" : "Use my location"}
                </button>
                {locError && <p className="note">{locError}</p>}
                <div className="or mono tiny">OR</div>
                <div className="search">
                  <Search />
                  <input className="field bare" placeholder="Search your city" value={q} onChange={(e) => setQ(e.target.value)} />
                </div>
                {results.length > 0 && (
                  <ul className="city-list">
                    {results.map((c) => (
                      <li key={c.city + c.country}>
                        <button onClick={() => pickCity(c)}>
                          <span>{c.city}</span>
                          <span className="muted">{c.country}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {q && results.length === 0 && <p className="note">No match — try a nearby big city.</p>}
              </>
            )}

            <div className="ob-actions">
              <button className="btn btn-ghost" onClick={() => setStep(1)}>Back</button>
              <button className="btn btn-ink" disabled={!place} onClick={submit}>
                {initial ? "Save" : "Join the globe"} <Arrow />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
