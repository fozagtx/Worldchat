import { useEffect, useRef, useState } from "react";
import Globe from "./components/Globe";
import { Arrow, Logo } from "./components/icons";
import { localTime } from "./lib/geo";
import "./landing.css";

const CITIES = [
  { city: "Tokyo", tz: "Asia/Tokyo" },
  { city: "Lagos", tz: "Africa/Lagos" },
  { city: "São Paulo", tz: "America/Sao_Paulo" },
  { city: "Istanbul", tz: "Europe/Istanbul" },
  { city: "Mumbai", tz: "Asia/Kolkata" },
  { city: "Mexico City", tz: "America/Mexico_City" },
  { city: "Nairobi", tz: "Africa/Nairobi" },
  { city: "Seoul", tz: "Asia/Seoul" },
];

function useOnline() {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/healthz")
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => alive && j && setN(j.online))
        .catch(() => {});
    load();
    const t = window.setInterval(load, 15000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, []);
  return n;
}

function useNow(ms = 20000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return now;
}

function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll(".reveal");
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        }),
      { threshold: 0.15 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

function OnlineChip({ n }: { n: number | null }) {
  if (n === null) return null;
  return (
    <span className="lp-online mono">
      <i className={n > 0 ? "on" : ""} />
      {n > 0 ? `${n} ${n === 1 ? "PERSON" : "PEOPLE"} ON THE GLOBE RIGHT NOW` : "THE GLOBE IS QUIET — BE THE FIRST PIN"}
    </span>
  );
}

export default function Landing() {
  const online = useOnline();
  const now = useNow();
  const [idx, setIdx] = useState(0);
  const globeWrap = useRef<HTMLDivElement>(null);
  useReveal();

  useEffect(() => {
    const t = window.setInterval(() => setIdx((i) => (i + 1) % CITIES.length), 2600);
    return () => window.clearInterval(t);
  }, []);
  const c = CITIES[idx];

  return (
    <div className="lp">
      <nav className="lp-nav">
        <a href="/" className="brand">
          <Logo />
          <span className="serif">Worldchat</span>
        </a>
        <div className="lp-links">
          <a href="#how">How it works</a>
          <a href="#privacy">Privacy</a>
        </div>
        <a href="/app" className="btn btn-ink btn-sm">
          Open the globe <Arrow />
        </a>
      </nav>

      <header className="lp-hero">
        <img src="/hero.jpg" alt="A woman laughing on a video call from her sofa" className="lp-hero-img" />
        <div className="lp-hero-fade" />
        <div className="lp-hero-copy">
          <OnlineChip n={online} />
          <h1 className="serif">
            Call anyone,
            <br />
            anywhere on Earth.
          </h1>
          <p className="lp-sentence serif">
            Say hello to{" "}
            <span key={c.city} className="pill lp-pill">
              someone in {c.city}
            </span>{" "}
            <span className="lp-time mono">IT'S {localTime(c.tz, now).toUpperCase()} THERE</span>
          </p>
          <p className="lp-sub">Spin the globe, see who's online and awake, and start a face-to-face video call in one tap. No account, no app to install.</p>
          <div className="lp-ctas">
            <a href="/app" className="btn btn-ink btn-lg">
              Open the globe <Arrow />
            </a>
            <a href="#how" className="btn btn-outline btn-lg">
              How it works
            </a>
          </div>
        </div>
      </header>

      <section className="lp-globe-sec">
        <div className="lp-globe-copy reveal">
          <span className="mono tiny">01 — THE GLOBE</span>
          <h2 className="serif">Everyone online is a pin you can tap.</h2>
          <p className="muted">
            Open Worldchat and you show up on a slowly turning globe next to everyone else who has it open. Each pin shows a city,
            the local time there and how far away it is, so you can see who's awake before you call.
          </p>
          <a href="/app" className="link">
            Drop your pin <Arrow />
          </a>
        </div>
        <div className="lp-globe-card reveal" ref={globeWrap}>
          <Globe me={null} peers={[]} selectedId={null} arcTo={null} offsetX={0} offsetY={0} onSelect={() => {}} />
          <span className="lp-globe-tag mono tiny">DRAG TO SPIN</span>
        </div>
      </section>

      <section id="how" className="lp-how">
        <div className="lp-head reveal">
          <span className="mono tiny">02 — HOW IT WORKS</span>
          <h2 className="serif">Three taps from hello.</h2>
        </div>
        <div className="lp-steps">
          {[
            ["01", "Drop your pin", "Type a first name and pick your city, or let your browser find it."],
            ["02", "Pick someone", "Filter by who's awake now or far away. Busy people show as on a call."],
            ["03", "Talk face to face", "They get a ring with Accept or Decline. Mute and camera do exactly what they say."],
          ].map(([n, t, d]) => (
            <article key={n} className="lp-step reveal">
              <span className="mono lp-num">{n}</span>
              <h3 className="serif">{t}</h3>
              <p className="muted">{d}</p>
            </article>
          ))}
        </div>
        <div className="lp-photos">
          <figure className="lp-photo reveal">
            <img src="/tokyo.jpg" alt="A man waving at his laptop on a video call in Tokyo" loading="lazy" />
            <figcaption className="pill">
              <i /> Tokyo · {localTime("Asia/Tokyo", now)} now
            </figcaption>
          </figure>
          <figure className="lp-photo reveal">
            <img src="/saopaulo.jpg" alt="A man on a phone video call on the steps of a plaza in São Paulo" loading="lazy" />
            <figcaption className="pill">
              <i /> São Paulo · {localTime("America/Sao_Paulo", now)} now
            </figcaption>
          </figure>
        </div>
      </section>

      <section id="privacy" className="lp-privacy">
        <div className="lp-head reveal">
          <span className="mono tiny">03 — PRIVACY</span>
          <h2 className="serif">Only what a call needs.</h2>
        </div>
        <div className="lp-facts">
          {[
            ["City, not address", "Your pin is rounded to about 10 km. Nobody sees where you actually are."],
            ["Nothing stored", "There are no accounts and no database. Close the tab and your pin is gone."],
            ["Device to device", "Video and audio travel directly between you and the person you call."],
          ].map(([t, d]) => (
            <div key={t} className="lp-fact reveal">
              <h3>{t}</h3>
              <p className="muted">{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="lp-final reveal">
        <h2 className="serif">The world is awake somewhere.</h2>
        <OnlineChip n={online} />
        <a href="/app" className="btn btn-ink btn-lg">
          Open the globe <Arrow />
        </a>
      </section>

      <footer className="lp-foot">
        <span className="brand">
          <Logo />
          <span className="serif">Worldchat</span>
        </span>
        <span className="mono tiny">VIDEO CALLS ACROSS THE GLOBE</span>
      </footer>
    </div>
  );
}
