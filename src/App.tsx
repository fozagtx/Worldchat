import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MapGlobe, { hasWebGL, type GlobeHandle } from "./components/MapGlobe";
import FallbackGlobe from "./components/FallbackGlobe";
import Intro from "./components/Intro";
import { HeroStats, Ticker, TopBar } from "./components/Hero";
import Welcome from "./components/Welcome";
import ActivityFeed from "./components/ActivityFeed";
import PersonCard from "./components/PersonCard";
import MatchBar from "./components/MatchBar";
import CallWindow from "./components/CallWindow";
import IncomingCall from "./components/IncomingCall";
import { usePresence } from "./lib/presence";
import { useCall } from "./lib/call";
import { loadProfile, saveProfile } from "./lib/profile";
import { setLofiDuck, startLofi, stopLofi } from "./lib/lofi";
import type { Peer, Profile } from "./lib/protocol";
import { Close, Locate } from "./components/icons";

function useIsMobile() {
  const [m, setM] = useState(() => window.matchMedia("(max-width: 760px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 760px)");
    const on = () => setM(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return m;
}

function loadLofiPreference() {
  try {
    return localStorage.getItem("worldchat.music") === "on";
  } catch {
    return false;
  }
}

export default function App() {
  const [profile, setProfile] = useState<Profile | null>(() => loadProfile());
  const [editing, setEditing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lofiOn, setLofiOn] = useState(loadLofiPreference);
  const lofiGestureStarted = useRef(false);
  const pendingIntent = useRef<"match" | "browse" | null>(null);
  const globe = useRef<GlobeHandle>(null);
  const pendingJoin = useRef<Peer | null>(null);
  const mobile = useIsMobile();
  const webgl = useMemo(hasWebGL, []);
  const [mapReady, setMapReady] = useState(!webgl);
  const [introDone, setIntroDone] = useState(false);
  const onMapReady = useCallback(() => setMapReady(true), []);
  const finishIntro = useCallback(() => setIntroDone(true), []);

  const presence = usePresence(profile);
  const callApi = useCall(presence);
  const { state } = callApi;

  const peersById = useMemo(() => new Map(presence.peers.map((p) => [p.id, p])), [presence.peers]);
  const inCall = state.phase === "outgoing" || state.phase === "connecting" || state.phase === "active";
  const matching = presence.me?.status === "matching";
  const selected = selectedId ? peersById.get(selectedId) ?? null : null;

  const flash = useCallback((msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice((n) => (n === msg ? null : n)), 3500);
  }, []);

  useEffect(() => {
    setLofiDuck(inCall);
  }, [inCall]);

  useEffect(() => {
    if (!lofiOn || lofiGestureStarted.current) return;
    const startOnGesture = (event: Event) => {
      if (event.target instanceof Element && event.target.closest(".music-toggle")) return;
      if (lofiGestureStarted.current) return;
      lofiGestureStarted.current = true;
      window.removeEventListener("pointerdown", startOnGesture);
      window.removeEventListener("keydown", startOnGesture);
      void startLofi();
    };
    window.addEventListener("pointerdown", startOnGesture);
    window.addEventListener("keydown", startOnGesture);
    return () => {
      window.removeEventListener("pointerdown", startOnGesture);
      window.removeEventListener("keydown", startOnGesture);
    };
  }, [lofiOn]);

  const toggleLofi = () => {
    const next = !lofiOn;
    setLofiOn(next);
    try {
      localStorage.setItem("worldchat.music", next ? "on" : "off");
    } catch {}
    lofiGestureStarted.current = next;
    if (next) void startLofi();
    else stopLofi();
  };

  useEffect(() => {
    if (!pendingJoin.current) return;
    if (inCall || selectedId) {
      pendingJoin.current = null;
      return;
    }
    if (!introDone || !mapReady) return;
    const frame = window.requestAnimationFrame(() => {
      const peer = pendingJoin.current;
      if (!peer || inCall || selectedId) return;
      pendingJoin.current = null;
      globe.current?.focus(peer.lat, peer.lng);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [inCall, introDone, mapReady, selectedId]);

  useEffect(() => {
    if (selectedId && !peersById.has(selectedId)) setSelectedId(null);
  }, [selectedId, peersById]);

  // first-run intent: start matching as soon as we're connected
  useEffect(() => {
    if (presence.conn === "online" && pendingIntent.current === "match") {
      pendingIntent.current = null;
      presence.match();
    }
  }, [presence.conn, presence]);

  // Omegle-style: when a matched stranger skips, find the next one automatically
  useEffect(() => {
    if (state.phase === "ended" && state.source === "match" && state.remoteEnded) presence.match();
  }, [state.phase, state.source, state.remoteEnded]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(
    () =>
      presence.subscribe((m) => {
        if (m.type === "join" && !inCall && !selectedId) {
          flash(`${m.peer.name} just joined from ${m.peer.city}`);
          if (introDone && mapReady) globe.current?.focus(m.peer.lat, m.peer.lng);
          else pendingJoin.current = m.peer;
        } else if (m.type === "your-turn") {
          flash(`${m.peer.name} is free — calling now`);
          globe.current?.focus(m.peer.lat, m.peer.lng);
          void callApi.call(m.peer);
        } else if (m.type === "queue-closed") {
          const p = peersById.get(m.to);
          flash(`${p?.name ?? "They"} left, so the line closed`);
        } else if (m.type === "knock-error" && m.reason === "available") {
          const p = peersById.get(m.to);
          if (p) void callApi.call(p);
        } else if (m.type === "matched") {
          setSelectedId(null);
          globe.current?.focus(m.peer.lat, m.peer.lng);
        }
      }),
    [presence, callApi, peersById, flash, inCall, selectedId, introDone, mapReady],
  );

  const select = useCallback(
    (id: string | null) => {
      setSelectedId(id);
      const p = id ? peersById.get(id) : null;
      if (p) globe.current?.focus(p.lat, p.lng);
    },
    [peersById],
  );

  const startCall = (p: Peer) => {
    if (matching) presence.unmatch();
    setSelectedId(null);
    void callApi.call(p);
  };

  const next = () => {
    callApi.hangup(true);
    presence.match();
  };

  const saveMe = (p: Profile, intent: "match" | "browse") => {
    saveProfile(p);
    if (!profile && intent === "match") pendingIntent.current = "match";
    setProfile(p);
    setEditing(false);
  };

  const arcPeer = inCall || state.phase === "incoming" ? state.peer : selected;
  const othersMatching = presence.peers.filter((p) => p.status === "matching").length;

  return (
    <div className={`app ${introDone ? "revealed" : "pre"}`}>
      {webgl ? (
        <MapGlobe
          ref={globe}
          me={profile}
          peers={presence.peers}
          selectedId={selectedId}
          arcTo={arcPeer}
          paused={!!selected || inCall}
          revealed={introDone}
          onReady={onMapReady}
          padding={mobile ? { left: 0, right: 0, top: 0, bottom: inCall ? 0 : 160 } : { left: inCall ? 0 : 380, right: inCall ? 440 : 0, top: 0, bottom: 0 }}
          onSelect={select}
        />
      ) : (
        <FallbackGlobe
          ref={globe}
          me={profile}
          peers={presence.peers}
          selectedId={selectedId}
          arcTo={arcPeer}
          revealed={introDone}
          offsetX={mobile || inCall ? 0 : 380}
          offsetY={mobile && !inCall ? 160 : 0}
          onSelect={select}
        />
      )}

      {profile && (
        <>
          <TopBar me={profile} conn={presence.conn} lofiOn={lofiOn} onToggleLofi={toggleLofi} onEdit={() => setEditing(true)} />
          {!mobile && !inCall && <HeroStats me={profile} peers={presence.peers} conn={presence.conn} />}
          {!mobile && !selected && !inCall && <ActivityFeed events={presence.activity} />}
          {!inCall && <Ticker peers={presence.peers} onPick={select} />}
          {!inCall && state.phase !== "incoming" && (
            <button className="locate-btn" type="button" onClick={() => globe.current?.locate(profile.lat, profile.lng)} aria-label="Locate me" title="Locate me">
              <Locate />
            </button>
          )}
          {!inCall && state.phase !== "incoming" && (
            <MatchBar me={profile} matching={matching} others={presence.peers.length} othersMatching={othersMatching} onMatch={presence.match} onCancel={presence.unmatch} />
          )}
          {selected && !inCall && (
            <PersonCard
              me={profile}
              peer={selected}
              position={presence.queued[selected.id]}
              onCall={() => startCall(selected)}
              onKnock={() => presence.knock(selected.id)}
              onLeaveQueue={() => presence.unknock(selected.id)}
              onClose={() => setSelectedId(null)}
            />
          )}
        </>
      )}

      {profile && inCall && state.peer && (
        <CallWindow
          me={profile}
          state={state}
          localStream={callApi.localStream}
          remoteStream={callApi.remoteStream}
          micOn={callApi.micOn}
          camOn={callApi.camOn}
          hasCam={callApi.hasCam}
          knocks={presence.knocks}
          onMic={callApi.toggleMic}
          onCam={callApi.toggleCam}
          onHangup={() => callApi.hangup()}
          onNext={next}
        />
      )}

      {profile && state.phase === "incoming" && state.peer && <IncomingCall me={profile} peer={state.peer} onAccept={callApi.accept} onDecline={callApi.decline} />}

      {(notice || callApi.mediaError || (state.phase === "ended" && state.reason && !(state.source === "match" && state.remoteEnded))) && (
        <div className="toast" role="status">
          <span>{callApi.mediaError ?? notice ?? state.reason}</span>
          {callApi.mediaError && (
            <button className="icon-btn" onClick={callApi.clearMediaError} aria-label="Dismiss">
              <Close />
            </button>
          )}
        </div>
      )}

      {!introDone && (
        <Intro
          steps={[
            { label: "Drawing the globe", done: mapReady },
            { label: profile ? "Finding people online" : "Almost there", done: !profile || presence.conn === "online" },
          ]}
          onDone={finishIntro}
        />
      )}

      {introDone && (!profile || editing) && <Welcome initial={editing ? profile : null} onDone={saveMe} onCancel={editing ? () => setEditing(false) : undefined} />}
    </div>
  );
}
