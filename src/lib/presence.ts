import { useCallback, useEffect, useRef, useState } from "react";
import type { ActivityEvent, Peer, Profile, ServerMessage, SignalData, Status } from "./protocol";

export type ConnState = "connecting" | "online" | "offline";
export type Listener = (msg: ServerMessage) => void;

function wsUrl() {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/ws`;
}

export function usePresence(profile: Profile | null) {
  const [selfId, setSelfId] = useState<string | null>(null);
  const [peers, setPeers] = useState<Record<string, Peer>>({});
  const [conn, setConn] = useState<ConnState>("connecting");
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [queued, setQueued] = useState<Record<string, number>>({});
  const [knocks, setKnocks] = useState<{ count: number; names: string[] }>({ count: 0, names: [] });
  const wsRef = useRef<WebSocket | null>(null);
  const listeners = useRef(new Set<Listener>());
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
            setActivity((msg.activity ?? []).slice().reverse());
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
            setQueued((q) => {
              if (!(msg.id in q)) return q;
              const n = { ...q };
              delete n[msg.id];
              return n;
            });
            break;
          case "activity":
            setActivity((a) => [msg.event, ...a].slice(0, 25));
            break;
          case "queued":
            setQueued((q) => ({ ...q, [msg.to]: msg.position }));
            break;
          case "your-turn":
          case "queue-closed": {
            const id = msg.type === "your-turn" ? msg.peer.id : msg.to;
            setQueued((q) => {
              const n = { ...q };
              delete n[id];
              return n;
            });
            break;
          }
          case "knocks":
            setKnocks({ count: msg.count, names: msg.names });
            break;
        }
        listeners.current.forEach((l) => l(msg));
      };
      ws.onclose = () => {
        if (wsRef.current === ws) wsRef.current = null;
        setSelfId(null);
        setPeers({});
        setQueued({});
        setKnocks({ count: 0, names: [] });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!profile]);

  useEffect(() => {
    if (profile) raw({ type: "update", profile });
  }, [profile, raw]);

  const signal = useCallback((to: string, data: SignalData) => raw({ type: "signal", to, data }), [raw]);
  const setStatus = useCallback((status: Exclude<Status, "matching">) => raw({ type: "status", status }), [raw]);
  const match = useCallback(() => raw({ type: "match" }), [raw]);
  const unmatch = useCallback(() => raw({ type: "unmatch" }), [raw]);
  const knock = useCallback((to: string) => raw({ type: "knock", to }), [raw]);
  const unknock = useCallback(
    (to: string) => {
      setQueued((q) => {
        const n = { ...q };
        delete n[to];
        return n;
      });
      return raw({ type: "unknock", to });
    },
    [raw],
  );
  const talking = useCallback((withId: string) => raw({ type: "talking", with: withId }), [raw]);
  const subscribe = useCallback((l: Listener) => {
    listeners.current.add(l);
    return () => void listeners.current.delete(l);
  }, []);

  const all = Object.values(peers);
  const me = selfId ? peers[selfId] ?? null : null;
  const others = all.filter((p) => p.id !== selfId);
  return { selfId, me, peers: others, conn, activity, queued, knocks, signal, setStatus, match, unmatch, knock, unknock, talking, subscribe };
}
