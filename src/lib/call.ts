import { useCallback, useEffect, useRef, useState } from "react";
import type { Peer, SignalData, Status } from "./protocol";

export type CallPhase = "idle" | "outgoing" | "incoming" | "connecting" | "active" | "ended";

export interface CallState {
  phase: CallPhase;
  peer: Peer | null;
  since: number | null;
  reason: string | null;
  reconnecting: boolean;
  remoteAudio: boolean;
  remoteVideo: boolean;
}

const IDLE: CallState = { phase: "idle", peer: null, since: null, reason: null, reconnecting: false, remoteAudio: true, remoteVideo: true };
const RING_MS = 30000;
const ICE: RTCConfiguration = {
  iceServers: [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }],
};

interface Deps {
  signal: (to: string, data: SignalData) => boolean;
  setStatus: (s: Status) => void;
  onSignal: (h: (from: string, data: SignalData) => void) => () => void;
  onLeave: (h: (id: string) => void) => () => void;
  peers: Peer[];
}

async function getMedia(): Promise<{ stream: MediaStream | null; error: string | null }> {
  if (!navigator.mediaDevices?.getUserMedia) return { stream: null, error: "This browser can't access a camera or microphone." };
  try {
    return { stream: await navigator.mediaDevices.getUserMedia({ audio: true, video: { width: 1280, height: 720 } }), error: null };
  } catch {
    try {
      return { stream: await navigator.mediaDevices.getUserMedia({ audio: true }), error: null };
    } catch {
      return { stream: null, error: "Allow microphone access to make calls." };
    }
  }
}

export function useCall({ signal, setStatus, onSignal, onLeave, peers }: Deps) {
  const [state, setState] = useState<CallState>(IDLE);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [mediaError, setMediaError] = useState<string | null>(null);

  const stateRef = useRef(state);
  stateRef.current = state;
  const callId = useRef<string | null>(null);
  const pc = useRef<RTCPeerConnection | null>(null);
  const local = useRef<MediaStream | null>(null);
  const pendingIce = useRef<RTCIceCandidateInit[]>([]);
  const ringTimer = useRef<number | undefined>();
  const endTimer = useRef<number | undefined>();
  const peersRef = useRef(peers);
  peersRef.current = peers;

  const cleanup = useCallback(() => {
    window.clearTimeout(ringTimer.current);
    pc.current?.getSenders().forEach((s) => s.track?.stop());
    pc.current?.close();
    pc.current = null;
    local.current?.getTracks().forEach((t) => t.stop());
    local.current = null;
    pendingIce.current = [];
    callId.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setMicOn(true);
    setCamOn(true);
  }, []);

  const finish = useCallback(
    (reason: string | null) => {
      const peer = stateRef.current.peer;
      cleanup();
      setMediaError(null);
      setStatus("available");
      if (!reason) {
        setState(IDLE);
        return;
      }
      setState({ ...IDLE, phase: "ended", peer, reason });
      window.clearTimeout(endTimer.current);
      endTimer.current = window.setTimeout(() => setState((s) => (s.phase === "ended" ? IDLE : s)), 3200);
    },
    [cleanup, setStatus],
  );

  const buildPc = useCallback(
    (to: string) => {
      const conn = new RTCPeerConnection(ICE);
      pc.current = conn;
      const stream = local.current;
      if (stream) stream.getTracks().forEach((t) => conn.addTrack(t, stream));
      if (!stream || !stream.getAudioTracks().length) conn.addTransceiver("audio", { direction: "recvonly" });
      if (!stream || !stream.getVideoTracks().length) conn.addTransceiver("video", { direction: "recvonly" });
      const remote = new MediaStream();
      setRemoteStream(remote);
      conn.ontrack = (ev) => {
        if (!remote.getTracks().includes(ev.track)) remote.addTrack(ev.track);
        setRemoteStream(new MediaStream(remote.getTracks()));
      };
      conn.onicecandidate = (ev) => {
        if (ev.candidate && callId.current) signal(to, { kind: "ice", callId: callId.current, candidate: ev.candidate.toJSON() });
      };
      conn.onconnectionstatechange = () => {
        const s = conn.connectionState;
        if (s === "connected") setState((st) => ({ ...st, phase: "active", since: st.since ?? Date.now(), reconnecting: false }));
        else if (s === "disconnected") setState((st) => ({ ...st, reconnecting: true }));
        else if (s === "failed") {
          if (callId.current) signal(to, { kind: "hangup", callId: callId.current });
          finish("Couldn't connect — your networks blocked a direct call");
        }
      };
      return conn;
    },
    [signal, finish],
  );

  const flushIce = async () => {
    const conn = pc.current;
    if (!conn) return;
    for (const c of pendingIce.current.splice(0)) await conn.addIceCandidate(c).catch(() => {});
  };

  const call = useCallback(
    async (peer: Peer) => {
      if (stateRef.current.phase !== "idle" && stateRef.current.phase !== "ended") return;
      setMediaError(null);
      const id = crypto.randomUUID();
      callId.current = id;
      setState({ ...IDLE, phase: "outgoing", peer });
      setStatus("busy");
      const { stream, error } = await getMedia();
      if (callId.current !== id) {
        stream?.getTracks().forEach((t) => t.stop());
        return;
      }
      if (!stream) setMediaError(`${error} You can still see and hear them.`);
      local.current = stream;
      setLocalStream(stream);
      setCamOn(!!stream?.getVideoTracks().length);
      if (!signal(peer.id, { kind: "ring", callId: id })) return finish("You're offline");
      ringTimer.current = window.setTimeout(() => {
        if (callId.current === id && stateRef.current.phase === "outgoing") {
          signal(peer.id, { kind: "cancel", callId: id });
          finish("No answer");
        }
      }, RING_MS);
    },
    [signal, setStatus, finish],
  );

  const accept = useCallback(async () => {
    const st = stateRef.current;
    const id = callId.current;
    if (st.phase !== "incoming" || !st.peer || !id) return;
    window.clearTimeout(ringTimer.current);
    setMediaError(null);
    setStatus("busy");
    setState((s) => ({ ...s, phase: "connecting" }));
    const { stream, error } = await getMedia();
    if (callId.current !== id) {
      stream?.getTracks().forEach((t) => t.stop());
      return;
    }
    if (error) setMediaError(`${error} You can still see and hear them.`);
    local.current = stream;
    setLocalStream(stream);
    setCamOn(!!stream?.getVideoTracks().length);
    signal(st.peer.id, { kind: "accept", callId: id });
  }, [signal, setStatus]);

  const decline = useCallback(() => {
    const st = stateRef.current;
    if (st.phase === "incoming" && st.peer && callId.current) signal(st.peer.id, { kind: "decline", callId: callId.current, reason: "declined" });
    finish(null);
  }, [signal, finish]);

  const hangup = useCallback(() => {
    const st = stateRef.current;
    if (st.peer && callId.current) {
      const kind = st.phase === "outgoing" ? "cancel" : "hangup";
      signal(st.peer.id, { kind, callId: callId.current });
    }
    finish(st.phase === "active" ? "Call ended" : null);
  }, [signal, finish]);

  const sendMedia = useCallback(
    (audio: boolean, video: boolean) => {
      const st = stateRef.current;
      if (st.peer && callId.current) signal(st.peer.id, { kind: "media", callId: callId.current, audio, video });
    },
    [signal],
  );

  const toggleMic = useCallback(() => {
    const t = local.current?.getAudioTracks()[0];
    if (!t) return;
    t.enabled = !t.enabled;
    setMicOn(t.enabled);
    sendMedia(t.enabled, !!local.current?.getVideoTracks()[0]?.enabled);
  }, [sendMedia]);

  const toggleCam = useCallback(() => {
    const t = local.current?.getVideoTracks()[0];
    if (!t) return;
    t.enabled = !t.enabled;
    setCamOn(t.enabled);
    sendMedia(!!local.current?.getAudioTracks()[0]?.enabled, t.enabled);
  }, [sendMedia]);

  useEffect(
    () =>
      onSignal(async (from, data) => {
        const st = stateRef.current;
        if (data.kind === "ring") {
          const peer = peersRef.current.find((p) => p.id === from);
          if (!peer || (st.phase !== "idle" && st.phase !== "ended")) {
            signal(from, { kind: "decline", callId: data.callId, reason: "busy" });
            return;
          }
          callId.current = data.callId;
          setState({ ...IDLE, phase: "incoming", peer });
          ringTimer.current = window.setTimeout(() => {
            if (callId.current === data.callId && stateRef.current.phase === "incoming") {
              signal(from, { kind: "decline", callId: data.callId, reason: "missed" });
              finish(`Missed call from ${peer.name}`);
            }
          }, RING_MS);
          return;
        }
        if (data.callId !== callId.current || st.peer?.id !== from) return;
        switch (data.kind) {
          case "accept": {
            if (st.phase !== "outgoing") return;
            window.clearTimeout(ringTimer.current);
            setState((s) => ({ ...s, phase: "connecting" }));
            const conn = buildPc(from);
            const offer = await conn.createOffer();
            await conn.setLocalDescription(offer);
            signal(from, { kind: "offer", callId: data.callId, sdp: offer });
            break;
          }
          case "offer": {
            const conn = pc.current ?? buildPc(from);
            await conn.setRemoteDescription(data.sdp);
            await flushIce();
            const answer = await conn.createAnswer();
            await conn.setLocalDescription(answer);
            signal(from, { kind: "answer", callId: data.callId, sdp: answer });
            break;
          }
          case "answer":
            await pc.current?.setRemoteDescription(data.sdp);
            await flushIce();
            break;
          case "ice":
            if (pc.current?.remoteDescription) await pc.current.addIceCandidate(data.candidate).catch(() => {});
            else pendingIce.current.push(data.candidate);
            break;
          case "media":
            setState((s) => ({ ...s, remoteAudio: data.audio, remoteVideo: data.video }));
            break;
          case "decline":
            finish(data.reason === "busy" ? `${st.peer?.name} is on another call` : data.reason === "missed" ? "No answer" : `${st.peer?.name} can't talk right now`);
            break;
          case "cancel":
            finish(st.phase === "incoming" ? `Missed call from ${st.peer?.name}` : null);
            break;
          case "hangup":
            finish("Call ended");
            break;
        }
      }),
    [onSignal, signal, buildPc, finish],
  );

  useEffect(
    () =>
      onLeave((id) => {
        const st = stateRef.current;
        if (st.peer?.id === id && st.phase !== "idle" && st.phase !== "ended") finish(`${st.peer.name} went offline`);
      }),
    [onLeave, finish],
  );

  useEffect(() => () => cleanup(), [cleanup]);

  const hasCam = !!localStream?.getVideoTracks().length;
  return { state, localStream, remoteStream, micOn, camOn, hasCam, mediaError, clearMediaError: () => setMediaError(null), call, accept, decline, hangup, toggleMic, toggleCam };
}
