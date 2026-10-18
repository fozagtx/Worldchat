import { useEffect, useRef, useState } from "react";
import type { CallState } from "../lib/call";
import type { Profile } from "../lib/protocol";
import { distanceKm, formatKm, localTime } from "../lib/geo";
import Avatar from "./Avatar";
import { Cam, CamOff, Mic, MicOff, PhoneDown } from "./icons";

interface Props {
  me: Profile;
  state: CallState;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  micOn: boolean;
  camOn: boolean;
  hasCam: boolean;
  onMic: () => void;
  onCam: () => void;
  onHangup: () => void;
}

function useLevel(stream: MediaStream | null, bars: number) {
  const [levels, setLevels] = useState<number[]>(() => Array(bars).fill(0));
  useEffect(() => {
    const track = stream?.getAudioTracks()[0];
    if (!stream || !track) {
      setLevels(Array(bars).fill(0));
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ac = new AC();
    const src = ac.createMediaStreamSource(new MediaStream([track]));
    const an = ac.createAnalyser();
    an.fftSize = 128;
    src.connect(an);
    const buf = new Uint8Array(an.frequencyBinCount);
    let raf = 0;
    const loop = () => {
      an.getByteFrequencyData(buf);
      const out: number[] = [];
      const per = Math.floor(buf.length / bars) || 1;
      for (let i = 0; i < bars; i++) {
        let s = 0;
        for (let j = 0; j < per; j++) s += buf[i * per + j] ?? 0;
        out.push(s / per / 255);
      }
      setLevels(out);
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

function Timer({ since }: { since: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const s = Math.max(0, Math.floor((now - since) / 1000));
  return <>{`${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`}</>;
}

export default function CallView({ me, state, localStream, remoteStream, micOn, camOn, hasCam, onMic, onCam, onHangup }: Props) {
  const peer = state.peer!;
  const remoteHasVideo = !!remoteStream?.getVideoTracks().some((t) => t.readyState === "live") && state.remoteVideo;
  const live = state.phase === "active";
  const levels = useLevel(live ? remoteStream : null, 24);
  const km = distanceKm(me.lat, me.lng, peer.lat, peer.lng);

  const status =
    state.phase === "outgoing" ? `RINGING ${peer.name.toUpperCase()}` : state.phase === "connecting" ? "CONNECTING" : state.reconnecting ? "RECONNECTING" : null;

  return (
    <div className="call">
      <header className="call-head">
        <div>
          <span className="mono tiny">
            {live && state.since ? (
              <span className="live-dot">
                <i /> LIVE · <Timer since={state.since} />
              </span>
            ) : (
              status
            )}
          </span>
          <h2 className="serif">
            {peer.name} <span className="muted">in {peer.city}</span>
          </h2>
        </div>
        <div className="call-facts mono tiny">
          <span>{localTime(peer.tz)} THERE</span>
          <span>{formatKm(km).toUpperCase()} AWAY</span>
        </div>
      </header>

      <div className="stage">
        {live && remoteHasVideo ? (
          <Video stream={remoteStream} className="remote" />
        ) : (
          <div className="stage-empty">
            <div className={`pulse ${live ? "" : "ringing"}`}>
              <Avatar name={peer.name} color={peer.color} size={112} />
            </div>
            <p className="muted">{live ? (state.remoteVideo ? "Audio only" : `${peer.name} turned their camera off`) : state.phase === "outgoing" ? "Waiting for them to pick up…" : "Setting up a direct connection…"}</p>
          </div>
        )}
        {/* keep remote audio playing even when video is hidden */}
        {live && !remoteHasVideo && <Video stream={remoteStream} className="hidden" />}
        {live && !state.remoteAudio && <span className="badge mono tiny">{peer.name.toUpperCase()} IS MUTED</span>}

        <div className={`pip ${hasCam && camOn ? "" : "pip-off"}`}>
          {hasCam && camOn ? <Video stream={localStream} muted className="mirror" /> : <Avatar name={me.name} color={me.color} size={44} />}
          <span className="mono tiny pip-tag">YOU</span>
        </div>
      </div>

      <div className="meter" aria-hidden>
        {levels.map((l, i) => (
          <i key={i} style={{ transform: `scaleY(${0.08 + l * 0.92})` }} />
        ))}
      </div>

      <div className="controls">
        <button className={`round ${micOn ? "" : "off"}`} onClick={onMic} disabled={!localStream?.getAudioTracks().length} aria-pressed={!micOn}>
          {micOn ? <Mic /> : <MicOff />}
          <span>{micOn ? "Mute" : "Unmute"}</span>
        </button>
        <button className={`round ${camOn && hasCam ? "" : "off"}`} onClick={onCam} disabled={!hasCam} aria-pressed={!camOn}>
          {camOn && hasCam ? <Cam /> : <CamOff />}
          <span>{!hasCam ? "No camera" : camOn ? "Camera" : "Camera off"}</span>
        </button>
        <button className="round end" onClick={onHangup}>
          <PhoneDown />
          <span>{state.phase === "outgoing" ? "Cancel" : "End"}</span>
        </button>
      </div>
    </div>
  );
}
