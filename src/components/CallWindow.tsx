import { useEffect, useRef, useState } from "react";
import { FREE_SECONDS, type CallState } from "../lib/call";
import type { Profile } from "../lib/protocol";
import { distanceKm, formatKm, localTime } from "../lib/geo";
import Avatar from "./Avatar";
import Flag from "./Flag";
import { Cam, CamOff, Expand, Mic, MicOff, Next, PhoneDown, Shrink } from "./icons";
import Orbit from "./Orbit";

interface Props {
  me: Profile;
  state: CallState;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  micOn: boolean;
  camOn: boolean;
  hasCam: boolean;
  knocks: { count: number; names: string[] };
  onMic: () => void;
  onCam: () => void;
  onHangup: () => void;
  onNext: () => void;
}

function useLevel(stream: MediaStream | null, bars: number) {
  const [levels, setLevels] = useState<number[]>(() => Array(bars).fill(0));
  useEffect(() => {
    const track = stream?.getAudioTracks()[0];
    if (!stream || !track) {
      setLevels(Array(bars).fill(0));
      return;
    }
    const ac = new AudioContext();
    const src = ac.createMediaStreamSource(new MediaStream([track]));
    const an = ac.createAnalyser();
    an.fftSize = 64;
    src.connect(an);
    const buf = new Uint8Array(an.frequencyBinCount);
    let raf = 0;
    const loop = () => {
      an.getByteFrequencyData(buf);
      const per = Math.max(1, Math.floor(buf.length / bars));
      setLevels(Array.from({ length: bars }, (_, i) => (buf.slice(i * per, i * per + per).reduce((a, b) => a + b, 0) / per) / 255));
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => {
      cancelAnimationFrame(raf);
      src.disconnect();
      void ac.close();
    };
  }, [stream, bars]);
  return levels;
}

function Video({ stream, muted, className }: { stream: MediaStream | null; muted?: boolean; className: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream;
  }, [stream]);
  return <video ref={ref} className={className} autoPlay playsInline muted={muted} />;
}

function useClock(since: number | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!since) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [since]);
  if (!since) return null;
  const left = Math.max(0, FREE_SECONDS - Math.floor((now - since) / 1000));
  return { left, label: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` };
}

export default function CallWindow({ me, state, localStream, remoteStream, micOn, camOn, hasCam, knocks, onMic, onCam, onHangup, onNext }: Props) {
  const [big, setBig] = useState(false);
  const peer = state.peer!;
  const live = state.phase === "active";
  const remoteHasVideo = live && state.remoteVideo && !!remoteStream?.getVideoTracks().some((t) => t.readyState === "live");
  const orbitSize = big ? 280 : 220;
  const levels = useLevel(live ? remoteStream : null, 18);
  const clock = useClock(live ? state.since : null);
  const status =
    state.phase === "outgoing" ? "RINGING…" : state.phase === "connecting" ? (state.source === "match" ? "MATCHED · CONNECTING" : "CONNECTING") : state.reconnecting ? "RECONNECTING" : null;
  const emptyMessage = live ? (state.remoteVideo ? "Audio only" : "Their camera is off") : state.phase === "outgoing" ? "Waiting for them to pick up…" : "Connecting you directly…";
  const orbitText =
    state.phase === "outgoing"
      ? `CALLING ${peer.name} · ${peer.city} ·`
      : state.phase === "connecting"
        ? "CONNECTING YOU DIRECTLY ·"
        : live && state.remoteVideo
          ? "AUDIO ONLY ·"
          : live
            ? "CAMERA OFF ·"
            : state.reconnecting
              ? "RECONNECTING ·"
              : "CONNECTED ·";

  return (
    <div className={`card callwin ${big ? "big" : ""}`}>
      <header className="cw-head">
        <Avatar seed={peer.avatar} size={30} />
        <div className="cw-who">
          <strong>{peer.name}</strong>
          <span className="muted">
            <Flag cc={peer.cc} /> {peer.city} · {localTime(peer.tz)} · {formatKm(distanceKm(me.lat, me.lng, peer.lat, peer.lng))}
          </span>
        </div>
        <span className={`mono tiny cw-clock ${clock && clock.left <= 30 ? "warn" : ""}`}>{clock ? `${clock.label} LEFT` : status}</span>
        <button className="icon-btn" onClick={() => setBig((b) => !b)} aria-label={big ? "Shrink" : "Expand"}>
          {big ? <Shrink /> : <Expand />}
        </button>
      </header>

      {state.shared.length > 0 && (
        <div className="cw-shared">
          <span className="mono tiny">YOU BOTH LIKE</span>
          {state.shared.map((i) => (
            <span key={i} className="tag sm on">
              {i}
            </span>
          ))}
        </div>
      )}

      <div className="cw-stage">
        <Orbit
          size={orbitSize}
          text={orbitText}
          glow={remoteHasVideo ? "soft" : "strong"}
          tone="dark"
          className="orbit-call"
          center={remoteHasVideo ? undefined : <Avatar seed={peer.avatar} size={84} />}
        />
        {remoteHasVideo ? (
          <Video stream={remoteStream} className="remote" />
        ) : (
          <p className="cw-empty">{emptyMessage}</p>
        )}
        {live && !remoteHasVideo && <Video stream={remoteStream} className="hidden" />}
        {live && !state.remoteAudio && <span className="badge mono tiny">MUTED</span>}
        <div className={`pip ${hasCam && camOn ? "" : "pip-off"}`}>
          {hasCam && camOn ? <Video stream={localStream} muted className="mirror" /> : <Avatar seed={me.avatar} size={36} />}
        </div>
        {live && (
          <div className="meter" aria-hidden>
            {levels.map((l, i) => (
              <i key={i} style={{ transform: `scaleY(${0.12 + l * 0.88})` }} />
            ))}
          </div>
        )}
      </div>

      {knocks.count > 0 && (
        <p className="cw-knocks mono tiny">
          {knocks.count} WAITING TO TALK TO YOU · {knocks.names.join(", ").toUpperCase()}
        </p>
      )}

      <div className="cw-controls">
        <button className={`ctl ${micOn ? "" : "off"}`} onClick={onMic} disabled={!localStream?.getAudioTracks().length} aria-label={micOn ? "Mute" : "Unmute"} title={micOn ? "Mute" : "Unmute"}>
          {micOn ? <Mic /> : <MicOff />}
        </button>
        <button className={`ctl ${camOn && hasCam ? "" : "off"}`} onClick={onCam} disabled={!hasCam} aria-label="Camera" title={hasCam ? "Camera" : "No camera"}>
          {camOn && hasCam ? <Cam /> : <CamOff />}
        </button>
        {state.source === "match" && (
          <button className="ctl next" onClick={onNext} title="Skip to someone new">
            <Next /> Next
          </button>
        )}
        <button className="ctl end" onClick={onHangup} aria-label={state.phase === "outgoing" ? "Cancel" : "End call"} title="End">
          <PhoneDown />
        </button>
      </div>
    </div>
  );
}
