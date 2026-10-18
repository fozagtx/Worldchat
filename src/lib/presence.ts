import { useCallback, useEffect, useRef, useState } from "react";
import type { Peer, Profile, ServerMessage, SignalData, Status } from "./protocol";

export type ConnState = "connecting" | "online" | "offline";
type SignalHandler = (from: string, data: SignalData) => void;

function wsUrl() {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/ws`;
}

export function usePresence(profile: Profile | null) {
  const [selfId, setSelfId] = useState<string | null>(null);
  const [peers, setPeers] = useState<Record<string, Peer>>({});
  const [conn, setConn] = useState<ConnState>("connecting");
  const wsRef = useRef<WebSocket | null>(null);
  const handlers = useRef(new Set<SignalHandler>());
  const leaveHandlers = useRef(new Set<(id: string) => void>());
  const profileRef = useRef(profile);
  profileRef.current = profile;

  const raw = useCallback((msg: unknown) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }, []);

  useEffect(() => {
    if (!profile) return;
    let closed = false;
    let retry = 0;
    let timer: number | undefined;

    const connect = () => {
      setConn("connecting");
      const ws = new WebSocket(wsUrl());
      wsRef.current = ws;
      ws.onopen = () => {
        retry = 0;
        ws.send(JSON.stringify({ type: "hello", profile: profileRef.current }));
      };
      ws.onmessage = (ev) => {
        let msg: ServerMessage;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        switch (msg.type) {
          case "welcome":
            setSelfId(msg.id);
            setPeers(Object.fromEntries(msg.peers.map((p) => [p.id, p])));
            setConn("online");
            break;
          case "join":
          case "update":
            setPeers((prev) => ({ ...prev, [msg.peer.id]: msg.peer }));
            break;
          case "leave":
            setPeers((prev) => {
              const next = { ...prev };
              delete next[msg.id];
              return next;
            });
            leaveHandlers.current.forEach((h) => h(msg.id));
            break;
          case "signal":
            handlers.current.forEach((h) => h(msg.from, msg.data));
            break;
          case "signal-error":
            leaveHandlers.current.forEach((h) => h(msg.to));
            break;
        }
      };
      ws.onclose = () => {
        if (wsRef.current === ws) wsRef.current = null;
        setSelfId(null);
        setPeers({});
        if (closed) return;
        setConn("offline");
        retry += 1;
        timer = window.setTimeout(connect, Math.min(10000, 600 * 2 ** retry));
      };
    };
    connect();
    return () => {
      closed = true;
      window.clearTimeout(timer);
      wsRef.current?.close();
      wsRef.current = null;
    };
    // reconnect only when going from no profile to a profile
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!profile]);

  useEffect(() => {
    if (profile) raw({ type: "update", profile });
  }, [profile, raw]);

  const signal = useCallback((to: string, data: SignalData) => raw({ type: "signal", to, data }), [raw]);
  const setStatus = useCallback((status: Status) => raw({ type: "status", status }), [raw]);
  const onSignal = useCallback((h: SignalHandler) => {
    handlers.current.add(h);
    return () => void handlers.current.delete(h);
  }, []);
  const onLeave = useCallback((h: (id: string) => void) => {
    leaveHandlers.current.add(h);
    return () => void leaveHandlers.current.delete(h);
  }, []);

  const others = Object.values(peers).filter((p) => p.id !== selfId);
  return { selfId, peers: others, conn, signal, setStatus, onSignal, onLeave };
}
