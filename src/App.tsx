import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Globe, { type GlobeHandle } from "./components/Globe";
import Onboarding from "./components/Onboarding";
import PeoplePanel from "./components/PeoplePanel";
import CallView from "./components/CallView";
import IncomingCall from "./components/IncomingCall";
import { usePresence } from "./lib/presence";
import { useCall } from "./lib/call";
import { loadProfile, saveProfile } from "./lib/profile";
import type { Peer, Profile } from "./lib/protocol";
import { Close } from "./components/icons";

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

export default function App() {
  const [profile, setProfile] = useState<Profile | null>(() => loadProfile());
  const [editing, setEditing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const globe = useRef<GlobeHandle>(null);
  const mobile = useIsMobile();

  const presence = usePresence(profile);
  const callApi = useCall(presence);
  const { state } = callApi;

  const peersById = useMemo(() => new Map(presence.peers.map((p) => [p.id, p])), [presence.peers]);
  const inCall = state.phase === "outgoing" || state.phase === "connecting" || state.phase === "active";

  useEffect(() => {
    if (selectedId && !peersById.has(selectedId)) setSelectedId(null);
  }, [selectedId, peersById]);

  const select = useCallback(
    (id: string) => {
      setSelectedId(id);
      const p = peersById.get(id);
      if (p) globe.current?.focus(p.lat, p.lng);
    },
    [peersById],
  );

  const startCall = useCallback(
    (p: Peer) => {
      setSelectedId(p.id);
      globe.current?.focus(p.lat, p.lng);
      void callApi.call(p);
    },
    [callApi],
  );

  const saveMe = (p: Profile) => {
    saveProfile(p);
    setProfile(p);
    setEditing(false);
    globe.current?.focus(p.lat, p.lng);
  };

  const arcPeer = inCall || state.phase === "incoming" ? state.peer : selectedId ? peersById.get(selectedId) ?? null : null;

  return (
    <div className={`app ${inCall ? "in-call" : ""}`}>
      <Globe
        ref={globe}
        me={profile}
        peers={presence.peers}
        selectedId={selectedId}
        arcTo={arcPeer}
        offsetX={profile && !mobile && !inCall ? 420 : 0}
        offsetY={profile && mobile && !inCall ? Math.round(window.innerHeight * 0.48) : 0}
        onSelect={select}
      />

      {profile && !inCall && (
        <PeoplePanel
          me={profile}
          peers={presence.peers}
          conn={presence.conn}
          selectedId={selectedId}
          onSelect={select}
          onCall={startCall}
          onEditProfile={() => setEditing(true)}
        />
      )}

      {profile && inCall && state.peer && (
        <CallView
          me={profile}
          state={state}
          localStream={callApi.localStream}
          remoteStream={callApi.remoteStream}
          micOn={callApi.micOn}
          camOn={callApi.camOn}
          hasCam={callApi.hasCam}
          onMic={callApi.toggleMic}
          onCam={callApi.toggleCam}
          onHangup={callApi.hangup}
        />
      )}

      {profile && state.phase === "incoming" && state.peer && (
        <IncomingCall me={profile} peer={state.peer} onAccept={callApi.accept} onDecline={callApi.decline} />
      )}

      {(state.phase === "ended" && state.reason) || callApi.mediaError ? (
        <div className="toast" role="status">
          <span>{callApi.mediaError ?? state.reason}</span>
          {callApi.mediaError && (
            <button className="icon-btn" onClick={callApi.clearMediaError} aria-label="Dismiss">
              <Close />
            </button>
          )}
        </div>
      ) : null}

      {(!profile || editing) && <Onboarding initial={editing ? profile : null} onDone={saveMe} onCancel={editing ? () => setEditing(false) : undefined} />}
    </div>
  );
}
