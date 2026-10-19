# Worldchat — Product Requirements Document

**Version:** 1.0 · **Date:** 19 Oct 2026 · **Owner:** Fawuzan (fozagtx) · **Repo:** github.com/fozagtx/Worldchat (`main`)

---

## 1. Summary

Worldchat is an anonymous, instant, one-on-one video chat on a live rotating globe. It brings back what made Omegle work — **zero barriers: open the site, you're talking to someone** — with one twist: instead of only being paired at random, you **see everyone who is live, as pins on the globe, and can pick who to talk to** (or be matched automatically).

## 2. Problem

- Omegle shut down and left a large gap.
- Replacements added sign-ups, logins and verification layers that kill the "instant" magic.
- Random-only pairing gives no sense of *who* is out there or *where* — no curiosity, no choice.

## 3. Goals & non-goals

**Goals**
1. Time from page load to first conversation under **30 seconds**, with no account.
2. Make the live world tangible: real people, real places, visible on a globe.
3. Strictly one-on-one, private, direct calls.
4. Hook users on the interaction, then monetize extras (queue priority, more time, text chat, contact exchange).

**Non-goals (for now)**
- Accounts, profiles, followers, feeds.
- Group calls or shared rooms.
- Storing calls, messages or exact locations.

## 4. Target users

- 18–30, curious, social, mobile-first; want to meet people from other countries.
- Language learners and travellers ("talk to someone in Tokyo right now").
- Former Omegle users who want the old "just start" feel.

## 5. User journey

1. **Open the link** → BFCM-style loader (globe icon, spinning "SAY HELLO TO THE WORLD · LIVE" ring, real load progress) → "Worldchat" wordmark → globe grows in → live pins pop in.
2. **First visit only:** translucent card over the live globe:
   - Auto anonymous name ("cocoa heron") + cartoon avatar (shuffle).
   - Approximate city auto-detected (no permission prompt; ~10 km rounding).
   - I am: Man / Woman / Rather not say. Talk to: Anyone / Men / Women.
   - Optional interests (music, gaming, travel, football, tech, art, …).
   - **Match me now** or **I'll pick on the globe**. Camera turns on only when a call starts.
3. **Main screen:** globe centred on you; live stats (people live, countries, free to talk, talking now); live activity feed; scrolling footer marquee of everyone online; theme picker; locate-me.
4. **Match me:** paired with a compatible person (gender preference both ways, shared interests ranked higher, recent partners avoided). Call opens as a floating window; **Next** skips to a new match.
5. **Pick on the globe:** tap a pin → globe flies to them, line drawn from you → card with city, local time, distance.
   - Free → **Video call** (they get Accept/Decline).
   - Busy → **Knock & wait in line**, see your position, get rung automatically when they're free.
6. **Call:** 5-minute free call, countdown, mute/camera, expand, Next/End. While ringing/connecting, the BFCM-style orbit scene shows their avatar and status.

## 6. Feature status

### Shipped (live on `main`)

| Area | Feature |
|---|---|
| Entry | No landing page, no login; BFCM-style intro loader; first-run anonymous card |
| Identity | Anonymous name + DiceBear avatar; gender + preference; interests; approximate city |
| Globe | MapLibre globe with real country/city labels; no-WebGL fallback globe; deep zoom; centred on you; locate-me |
| Presence | Real live users only (no fake users); join toast + fly-to; overlapping pins fanned out; far-side pins visible |
| Matching | Preference-compatible, interest-ranked, recent-partner cooldown, Next |
| Direct calls | Tap a pin to call; Accept (green) / Decline (red); busy → knock queue with position |
| Calls | Real 1:1 WebRTC peer-to-peer video; working mute/camera; 5-minute timer |
| Live layer | Stats, activity feed, footer marquee, glowing arcs between people on a call |
| Themes | Cream (default) and **Night** (theme of the week: satellite Earth, dark glass UI) |
| Ambience | Generated lo-fi background music with on/off toggle; ducks during calls |

### In progress
- Same-city call arcs: make the connecting arc loop clearly outside the pins.

### Next (prioritised)

| # | Feature | Why | Monetization |
|---|---|---|---|
| 1 | **Permanent hosting** (Render/Fly + domain) | Quick tunnel URL dies when the dev machine sleeps | — |
| 2 | **TURN relay** | Calls fail on strict mobile/office networks without it | — |
| 3 | **Safety:** report/block, rate limits, basic moderation | Required before public launch | — |
| 4 | **Extend call** (+5 / +15 min) | Strongest "hooked" moment is the countdown | Pay per extension |
| 5 | **Skip the line** on knock queues | Popular people get long queues | Pay to move up |
| 6 | **Region/city targeting** for Match me | "Talk to someone in Brazil" | Premium filter |
| 7 | **Text chat** in call | Language barriers, muted users | Premium |
| 8 | **Swap contacts** (mutual opt-in) | Turn a great call into a connection | Pay to unlock |
| 9 | **Shared music** in call | Both hear the same track | Premium / sponsor |

## 7. Monetization model

- Free: unlimited matching, 5-minute calls, picking on the globe, knocking.
- Paid micro-transactions (no subscription needed at first): extend time, skip the line, region targeting, text chat, contact swap.
- Payment buttons appear only when payments really work (no fake controls).

## 8. Requirements

**Functional**
- Calls are strictly 1:1; a busy user can never be pulled into a second call.
- Opening the link never joins a call by itself.
- Only real connected users are shown; empty states are honest.

**Non-functional**
- Load to interactive under 3 s on 4G; globe at 60 fps on mid-range phones (fallback globe otherwise).
- HTTPS everywhere (required for camera/mic).
- Privacy: no accounts, no stored calls, location rounded to ~10 km, media device-to-device.

## 9. Technical overview

- **Client:** React 18 + TypeScript + Vite; MapLibre GL (OpenFreeMap Positron for Cream, Esri satellite imagery for Night); d3-geo canvas fallback; DiceBear avatars; WebAudio lo-fi engine.
- **Server:** Node.js + `ws` WebSocket at `/ws`, health at `/healthz`; in-memory presence, matching queue, knock queues, activity feed, call pairs (`with`). 25 automated tests.
- **Calls:** WebRTC peer-to-peer, Google STUN; signalling via the WebSocket server. TURN still to add.
- **Hosting today:** Cloudflare quick tunnel from the dev machine (temporary URL).

## 10. Success metrics

- % of visitors who start a call within 60 s (target ≥ 50%).
- Median call length; % of calls reaching the 5-minute limit.
- Calls per session; Next rate.
- Paid conversion on "extend call" at the countdown.
- Call connection success rate (target ≥ 95% once TURN is live).

## 11. Risks

| Risk | Mitigation |
|---|---|
| Abuse / explicit content (Omegle's downfall) | Report/block, rate limits, moderation, 18+ notice before launch |
| Calls failing on strict networks | TURN relay |
| Temporary URL | Permanent hosting + domain |
| Esri imagery terms (non-commercial free tier) | Licensed imagery or a commercial tile plan before charging users |
| Empty globe at launch | Seeded launches by region/time zone, invite links (never fake users) |

## 12. Open questions

1. Hosting choice: Render or Fly, and which domain?
2. Payment provider (Stripe, Paystack/Flutterwave for Africa, or crypto)?
3. Age gate and moderation approach before public launch?

## 13. Master prompt

The exact prompt to recreate this app in any vibe-coding tool (Lovable, Bolt, v0, Cursor, Replit) is in **Worldchat-Master-Prompt.md** (also PDF), and is included below.


You are building **Worldchat**: an anonymous, instant, strictly one-on-one video chat that opens directly onto a live rotating 3D globe showing every real person online as an avatar pin. Think "Omegle with no barriers, plus a world map you can pick people from". No landing page, no sign-up, no login, no fake users, no fake buttons.

## 0. Hard rules
1. **No mock data anywhere.** Only real connected browsers appear. If nobody else is online, show an honest empty state ("No one else is online yet — share the link and they'll appear here").
2. **No fake controls.** Never render a button for something that doesn't work (no payment, text-chat, share or zoom buttons that do nothing).
3. **Calls are strictly 1:1.** Opening the link never joins a call. A busy person can never be pulled into a second call. There are no shared rooms.
4. **Privacy:** no accounts, nothing stored server-side beyond memory, location rounded to ~10 km, video/audio goes peer-to-peer.
5. HTTPS in production (camera/mic require it).

## 1. Stack
- **Client:** React 18 + TypeScript + Vite. `maplibre-gl` (globe projection), `d3-geo` + `topojson-client` + `world-atlas` (no-WebGL fallback globe), `@dicebear/core` + `@dicebear/collection` (style `notionists`) for avatars.
- **Server:** Node.js (ESM) + `ws`. One process serves the built `dist/` folder, `GET /healthz` → `{"ok":true,"online":<n>}`, and a WebSocket at `/ws`. All state in memory.
- **Calls:** browser WebRTC, ICE servers `stun:stun.l.google.com:19302` and `stun:stun1.l.google.com:19302` (add a TURN server in production). Signalling goes through the WebSocket.
- Fonts (Google Fonts): **Instrument Serif** (headlines/big numbers), **Inter Tight** 400/500/600 (UI), **JetBrains Mono** 500 (uppercase micro-labels, letter-spacing 0.06em).
- Scripts: `dev` (Vite on 5173 proxying `/ws` and `/healthz` to the node server on 8787), `build` (`tsc -b && vite build`), `start` (`node server/index.js`, `PORT` env), `test` (`node --test`).

## 2. Data model
```ts
type Status = "available" | "busy" | "matching";
type Gender = "m" | "f" | "x";            // man / woman / rather not say
type Seeking = "any" | "m" | "f";
interface Profile { name: string; avatar: string; color: string; gender: Gender; seeking: Seeking;
  interests: string[]; city: string; country: string; cc: string; lat: number; lng: number; tz: string; }
interface Peer extends Profile { id: string; status: Status; with: string | null; joinedAt: string; }
interface ActivityEvent { id: string; kind: "join" | "leave" | "talking" | "knock"; names: string[]; cc: string; city: string; at: number; }
```
- Interests list: music, gaming, travel, football, tech, art, movies, languages, food, anime, startups, fashion, books, fitness (max 5 per person).
- Anonymous names: two-word "adjective animal" in warm tones, e.g. "cocoa heron", "honey otter", "maple ibex".
- Server sanitises every field: trims/limits string lengths, clamps lat/lng, rounds coordinates to 1 decimal (~10 km), whitelists gender/seeking/interests, ISO-2 `cc`.
- Client saves the profile in `localStorage["worldchat.profile.v2"]`; theme in `worldchat.theme`; music in `worldchat.music`.

## 3. WebSocket protocol (`/ws`, JSON messages)
**Client → server**
- `hello {profile}` (must be first; nothing is broadcast to a socket before hello) · `update {profile}` · `status {status}`
- `match` (join the match queue) · `unmatch` (leave queue / skip current match)
- `knock {to}` (join a busy person's line) · `unknock {to}`
- `talking {with}` (call became live) · `signal {to, data}` (WebRTC relay, max 64 KB)

**Server → client**
- `welcome {id, peers, activity}` · `join {peer}` · `update {peer}` · `leave {id}`
- `matched {peer, callId, initiator, shared: string[]}` · `queued {to, position}` · `knocks {count}` · `your-turn {from}` · `queue-closed {to}`
- `signal {from, data}` · `activity {event}` · `error {message}`

**Signal data kinds:** `ring {callId}`, `accept {callId}`, `decline {callId, reason: "declined"|"busy"|"missed"}`, `cancel {callId}`, `offer/answer {callId, sdp}`, `ice {callId, candidate}`, `hangup {callId}`, `media {callId, mic, cam}`.

**Server logic**
- **Matching:** pair two people in the queue only if each one's `seeking` accepts the other's `gender` (`any` accepts all). Rank candidates by number of shared interests (highest first), then by wait time. Don't re-pair the same two people within 30 s. Send `matched` to both with the shared interests; mark both `busy` and set `with` to each other.
- **`with`:** set on match and on `talking` (only if both are busy); cleared when either goes `available`, unmatches or disconnects. Broadcast `update` for both. Clients draw live arcs from it.
- **Knock queues:** per-person FIFO line. On the target becoming available, send `your-turn` to the first in line (who then auto-rings). Send position updates. On disconnect, clean up every queue the person was in or owned (`queue-closed`).
- **Activity ring buffer:** last ~30 events; dedupe `talking` per pair within 10 s.
- Heartbeat ping every 20 s; drop dead sockets.
- Write unit tests for: sanitising, compatible matching, interest ranking, cooldown, unmatch, knock queues + your-turn, disconnect cleanup, activity, hello-gated broadcast, and `with` set/clear.

## 4. Design system
**Cream theme (default)** — CSS variables:
`--bg #f4ede3; --bg-2 #efe5d7; --surface #fbf7f1; --surface-2 #f7f0e6; --ink #2b1d14; --ink-2 #4a3628; --muted #8c7a6b; --line #e4d6c4; --line-2 #d8c6b0; --brown #8a5a3b; --terra #b5602f; --green #5e7f4f; --red #b3412e;`
shadow: `0 1px 0 rgba(255,255,255,.7) inset, 0 18px 50px -18px rgba(74,45,24,.28), 0 2px 6px rgba(74,45,24,.06)`.
Primary buttons: dark ink pills (`--ink` bg, cream text). Cards: `--surface` with 1px `--line` border, 16–20px radius, backdrop blur. Micro-labels: JetBrains Mono uppercase, tiny. Big numbers: Instrument Serif.

**Night theme ("Theme of the week")** — set `data-theme` on `<html>`:
`--bg #07080d; --bg-2 #0d1530; --surface rgba(16,18,26,.78); --surface-2 rgba(22,25,35,.88); --ink #e9eaf0; --ink-2 #c7cad5; --muted #8a8fa3; --line rgba(255,255,255,.08); --line-2 rgba(255,255,255,.14); accent/green #5cff8a`.
Background: `radial-gradient(60% 60% at 55% 50%, #0d1530 0%, #07080d 70%)`. Primary button = green with `#07120b` text. Green used sparingly (live dot, pin rings, arcs, primary button).

## 5. Screens & behaviour (build in this order)
### 5.1 Intro loader (Shopify BFCM-inspired)
Full-screen cream with a faint grid and radial vignette. Centre: 200px "Orbit" — a wireframe globe icon (meridian ellipses animating to fake a spin), the text "SAY HELLO TO THE WORLD · LIVE · " rotating around it in mono, and a glowing terra ring whose stroke fills with **real** progress (steps: map loaded, socket connected). Show "Worldchat" in Instrument Serif with letters rising in. Minimum 1.4 s, max 9 s. Then fade out (~1.1 s) while the globe scales/grows in from small to full, then pins pop in one by one. Make Orbit a reusable component `<Orbit size progress text glow tone center/>`.

### 5.2 Globe (the whole background)
- MapLibre globe projection, style `https://tiles.openfreemap.org/styles/positron` restyled to cream (land `#ecdfcd`, water/space cream, borders `#c8ae92`, country labels ink, city labels `#8c6c55`). maxZoom 18. Drag to rotate, scroll/pinch to zoom.
- Night theme: swap with `map.setStyle` (keep camera) to a raster satellite source `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}` (attribution "Esri, Maxar, Earthstar Geographics") plus white country labels with a dark halo; dark sky with a soft blue horizon glow. Re-add custom sources/layers on `style.load`.
- **No WebGL?** Use a d3-geo orthographic canvas globe with dotted land, drag rotation, wheel + pinch zoom (up to 8×), same pins and arcs, theme-aware colours.
- On first reveal, centre the camera on **your own pin** (desktop zoom ≈ 1.95, mobile ≈ 1.0, offset for the bottom UI). Locate-me round button bottom-right flies back to you.
- **Pins:** DOM markers = 44px circle avatar (DiceBear notionists, seed = avatar) with a ring and a status dot (green available, terra/red busy, pulsing when matching). "You" pin has a small dark "You" label and sits below peers. Use `classList` (never overwrite `className`, or MapLibre markers lose positioning). Pins on the far side stay visible at 0.42 opacity. Pins within ~0.6° of each other fan out in a small deterministic ring (display-only; distance math uses real coords). Pins added after the intro skip the pop animation.
- When someone joins (not on initial welcome) and you're idle: toast "<name> just joined from <city>" and fly to them.
- **Live call arcs:** for every pair with `with` set (dedupe A↔B, include yourself), draw a great-circle line between their displayed pins: a 12px blurred glow layer (opacity 0.85) + a 3px core. Cream: glow `#c9783f`, core `#b5602f`. Night: glow `#8b5cf6`, core `#ddd6fe`. Fade in over 700 ms; remove when the call ends. For pairs closer than 1500 km, draw a curved loop in **screen space** (quadratic bezier, control point pushed ≥110px perpendicular, away from nearby pins), recomputed on map move, with small glowing dots at each end.
- **Selected arc:** dashed line from you to the selected person (terra in Cream, green in Night).

### 5.3 First-visit card (only if no saved profile)
Translucent blurred card centred over the live globe:
- Avatar + generated name, each with a shuffle button.
- Approximate city auto-filled (timezone → nearest city in a built-in city list; never a permission popup), editable via search.
- "I am": Man / Woman / Rather not say. "Talk to": Anyone / Men / Women. Optional interest chips.
- Two buttons: **Match me now** (dark pill) and **I'll pick on the globe** (outline). "No sign-up. Camera turns on only when a call starts."

### 5.4 Main screen (ADPList Wrapped-inspired hero layout)
- **Top bar:** globe logo + "Worldchat" (serif), a LIVE chip with a pulsing dot, a "Lo-fi on/off" toggle, and on the right your avatar + name (click → edit profile card).
- **Left: stacked live numbers** (mono label above, huge serif number): People live right now · Countries on the globe · Free to talk · Talking right now. All computed from real presence.
- **Right (wide screens): Live activity** card: "<name> joined from 🇳🇬 Lagos", "<A> started talking with <B>", "<name> left", "<name> knocked for <B>", with relative times.
- **Bottom centre:** "Match me with anyone →" dark pill + mono hint "OR TAP ANYONE ON THE GLOBE". While matching: "Finding someone…" with cancel. While in a knock line: "You're #2 in <name>'s line" + leave.
- **Footer marquee:** 50px bar, everyone online as avatar · name (mono, accent) · flag · country · status dot. Infinite seamless right-to-left scroll at ~40px/s (repeat items until > 2× viewport width, loop with translateX(-50%)), pauses on hover/focus, items clickable (fly to person), static with prefers-reduced-motion, edge fade mask.
- **Bottom-right stack:** theme button (half-moon icon) above the locate-me button; both hidden during calls.
- **Theme picker popover:** "Choose theme" card with two tiles (mini preview, name, subtitle): **Cream** "Worldchat classic" and **Night** "Theme of the week · dark" with a green WEEKLY badge. Applies instantly with a soft cross-fade, remembered, closes on outside click/Escape.

### 5.5 Person card (tap a pin)
Globe flies to them (slight tilt), dashed arc from you. Card: avatar, name, flag + city, their local time, distance in km, shared interests. If available: **Video call**. If busy: **Knock & wait in line** → shows your position and a Leave-line button; when they're free you are rung automatically.

### 5.6 Calls
- Outgoing ring → callee sees the **Incoming call** card at top centre: avatar, name, flag, city · local time · distance, and two pill buttons: **Decline** (solid `#b3412e`, phone-down icon) and **Accept** (solid `#5e7f4f`, phone icon), white text, 44px tall. Busy callees auto-decline with "busy". 30 s no answer → "missed".
- **Call window:** floating card bottom-right (expandable to a large centred view). Header: avatar, name, flag, city · time · distance, status chip (RINGING / CONNECTING / LIVE + countdown), expand button. Stage: remote video with your small picture-in-picture video. Behind the video and whenever there's no remote video (ringing, connecting, audio only, camera off), show the dark **Orbit** scene (deep brown `#24170f` base, faint warm grid, glowing terra ring) with their avatar inside the ring and rotating status text ("CALLING <NAME> · <CITY> · ", "CONNECTING YOU DIRECTLY · ", "CAMERA OFF · "). Show "You both like music, travel" pills from shared interests.
- Controls: mic toggle, camera toggle (actually enable/disable tracks and tell the other side via `media`), **Next** (matched calls: end + rejoin queue), End (red).
- Calls last **5 minutes** (`FREE_SECONDS = 300`) with a visible countdown; at 0 end with "Time's up — calls last 5 minutes". If the other person skips, automatically search again.
- Honest errors: no camera/mic permission → explain and allow audio-only/receive-only; ICE failure → "Couldn't connect — their network may block direct calls".

### 5.7 Lo-fi music
WebAudio generative loop (no audio files): 76 BPM, Fmaj7–Em7–Dm7–Cmaj7 soft electric-piano chords (detuned triangle/sine, slow attack, long release, gentle tremolo) through a ~1400 Hz lowpass with slight wow, swung boom-bap drums (sine-drop kick, noise snare, quiet hats), vinyl crackle, master gain 0.18 + compressor, lookahead scheduler. Default **off**; if saved on, start on the first user gesture. Duck to 0.05 during calls.

## 6. Responsive & accessibility
- Mobile (≤ 640px): stats shrink to a compact row, activity feed hidden, call window becomes a bottom sheet, globe zoom ~1.0, safe-area insets.
- All buttons have aria-labels; marquee items focusable; `prefers-reduced-motion` disables spins, marquee and pop animations.

## 7. Acceptance checklist (test with two or more real browsers, never mocks)
- [ ] Opening the site shows the loader → globe → your own pin centred, without scrolling.
- [ ] A second browser appears as a pin within 1 s, with toast + fly-to; both visible even in the same city.
- [ ] Match me pairs only compatible people, prefers shared interests, shows a live 2-way video call with countdown and Next.
- [ ] Tapping a free pin rings them; Accept is green, Decline is red; declining/missed are reported honestly.
- [ ] Tapping a busy pin offers Knock; position updates; you're rung automatically when they're free.
- [ ] A third browser can never join an existing call.
- [ ] Glowing arc appears between any two people on a call (also same-city), and disappears when it ends.
- [ ] Footer marquee scrolls continuously and pauses on hover.
- [ ] Theme picker switches Cream ↔ Night instantly and remembers it; all cards readable in both.
- [ ] Works without WebGL (fallback globe).
- [ ] Mute/camera really stop tracks; the other side sees "muted"/"camera off".
- [ ] `/healthz` returns the real online count; server tests pass.

## 8. Not in v1 (do NOT add buttons for these yet)
Paid queue priority, call extensions, region targeting, text chat, contact exchange, shared music in calls, TURN relay, report/block moderation. Add each only when it fully works end to end.
