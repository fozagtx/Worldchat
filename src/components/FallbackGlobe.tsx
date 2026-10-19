import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { geoEquirectangular, geoGraticule10, geoOrthographic, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import land110 from "world-atlas/land-110m.json";
import type { Peer, Profile } from "../lib/protocol";
import type { ThemeId } from "../lib/theme";
import { avatarUrl } from "../lib/identity";
import { distanceKm, fanOutOffsets, greatCircle, screenBridgeArc, type LiveArc, type PixelPoint } from "../lib/geo";

import type { GlobeHandle } from "./MapGlobe";

interface Props {
  me: Profile | null;
  peers: Peer[];
  liveArcs: LiveArc[];
  selectedId: string | null;
  arcTo: Peer | null;
  theme: ThemeId;
  offsetX: number;
  offsetY: number;
  revealed?: boolean;
  onSelect: (id: string | null) => void;
}

type Dot = [number, number, number, number, number]; // lng, lat, x, y, z (unit vector)

function buildDots(): Dot[] {
  const W = 720, H = 360;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const topo = land110 as any;
  const land = feature(topo, topo.objects.land);
  const proj = geoEquirectangular().translate([W / 2, H / 2]).scale(W / (2 * Math.PI));
  ctx.fillStyle = "#000";
  ctx.beginPath();
  geoPath(proj, ctx)(land);
  ctx.fill();
  const img = ctx.getImageData(0, 0, W, H).data;
  const dots: Dot[] = [];
  const step = 1.2;
  for (let lat = -84; lat <= 84; lat += step) {
    const lngStep = step / Math.max(0.2, Math.cos((lat * Math.PI) / 180));
    for (let lng = -180; lng < 180; lng += lngStep) {
      const px = Math.floor(((lng + 180) / 360) * W);
      const py = Math.floor(((90 - lat) / 180) * H);
      if (img[(py * W + px) * 4 + 3] > 0) {
        const la = (lat * Math.PI) / 180, lo = (lng * Math.PI) / 180;
        dots.push([lng, lat, Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)]);
      }
    }
  }
  return dots;
}

const FallbackGlobe = forwardRef<GlobeHandle, Props>(function FallbackGlobe({ me, peers, liveArcs, selectedId, arcTo, theme, offsetX, offsetY, revealed = true, onSelect }, ref) {
  const grow = useRef({ t0: 0, on: false });
  if (revealed && !grow.current.on) grow.current = { t0: performance.now(), on: true };
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const markers = useRef(new Map<string, HTMLButtonElement>());
  const rot = useRef<[number, number]>([me ? -me.lng : -10, me ? -me.lat : -15]);
  const centeredAt = useRef<{ lat: number; lng: number } | null>(me ? { lat: me.lat, lng: me.lng } : null);
  const anim = useRef<{ from: [number, number]; to: [number, number]; t0: number } | null>(null);
  const drag = useRef<{ x: number; y: number; r: [number, number] } | null>(null);
  const pointers = useRef(new Map<number, [number, number]>());
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);
  const idleAt = useRef(0);
  const zoom = useRef(1);
  const initialPeerIds = useRef(new Set<string>());
  const latePeerIds = useRef(new Set<string>());
  if (revealed) {
    for (const peer of peers) if (!initialPeerIds.current.has(peer.id)) latePeerIds.current.add(peer.id);
  } else {
    for (const peer of peers) initialPeerIds.current.add(peer.id);
  }
  const pinOffsets = useMemo(
    () => fanOutOffsets([...(me ? [{ id: "me", lat: me.lat, lng: me.lng }] : []), ...peers.map(({ id, lat, lng }) => ({ id, lat, lng }))]),
    [me, peers],
  );
  const nearLiveArcIds = useMemo(
    () => new Set(liveArcs.filter((arc) => distanceKm(arc.from[1], arc.from[0], arc.to[1], arc.to[0]) < 1500).map((arc) => arc.id)),
    [liveArcs],
  );
  const longLiveArcCoordinates = useMemo(
    () => new Map(liveArcs.filter((arc) => !nearLiveArcIds.has(arc.id)).map((arc) => [arc.id, greatCircle(arc.from, arc.to)])),
    [liveArcs, nearLiveArcIds],
  );
  const selectedIsNear = Boolean(me && arcTo && distanceKm(me.lat, me.lng, arcTo.lat, arcTo.lng) < 1500);
  const selectedLongArc = useMemo(
    () => (me && arcTo && !selectedIsNear ? greatCircle([me.lng, me.lat], [arcTo.lng, arcTo.lat]) : []),
    [me?.lat, me?.lng, arcTo?.lat, arcTo?.lng, selectedIsNear],
  );
  const props = useRef({ me, peers, liveArcs, arcTo, theme, offsetX, offsetY, pinOffsets, nearLiveArcIds, longLiveArcCoordinates, selectedIsNear, selectedLongArc });
  props.current = { me, peers, liveArcs, arcTo, theme, offsetX, offsetY, pinOffsets, nearLiveArcIds, longLiveArcCoordinates, selectedIsNear, selectedLongArc };

  useImperativeHandle(ref, () => ({
    focus(lat, lng) {
      const [l0, p0] = rot.current;
      let target = -lng;
      while (target - l0 > 180) target -= 360;
      while (target - l0 < -180) target += 360;
      anim.current = { from: [l0, p0], to: [target, -lat], t0: performance.now() };
      idleAt.current = performance.now() + 6000;
    },
    locate(lat, lng) {
      const [l0, p0] = rot.current;
      let target = -lng;
      while (target - l0 > 180) target -= 360;
      while (target - l0 < -180) target += 360;
      anim.current = { from: [l0, p0], to: [target, -lat], t0: performance.now() };
      zoom.current = 1;
      idleAt.current = performance.now() + 6000;
    },
  }));

  useEffect(() => {
    if (!me || (centeredAt.current?.lat === me.lat && centeredAt.current.lng === me.lng)) return;
    const [l0, p0] = rot.current;
    let target = -me.lng;
    while (target - l0 > 180) target -= 360;
    while (target - l0 < -180) target += 360;
    anim.current = { from: [l0, p0], to: [target, -me.lat], t0: performance.now() };
    centeredAt.current = { lat: me.lat, lng: me.lng };
    idleAt.current = performance.now() + 6000;
  }, [me?.lat, me?.lng]);

  useEffect(() => {
    const cv = canvas.current!, el = wrap.current!;
    const ctx = cv.getContext("2d")!;
    const dots = buildDots();
    const graticule = geoGraticule10();
    const proj = geoOrthographic().clipAngle(90).precision(0.4);
    const path = geoPath(proj, ctx);
    let w = 0, h = 0, raf = 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      w = el.clientWidth;
      h = el.clientHeight;
      cv.width = w * dpr;
      cv.height = h * dpr;
      cv.style.width = `${w}px`;
      cv.style.height = `${h}px`;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    const frame = (now: number) => {
      const {
        me,
        peers,
        liveArcs,
        arcTo,
        theme,
        offsetX,
        offsetY,
        pinOffsets,
        nearLiveArcIds,
        longLiveArcCoordinates,
        selectedIsNear,
        selectedLongArc,
      } = props.current;
      const gk = grow.current.on ? Math.min(1, (now - grow.current.t0) / 2200) : 0;
      const scale = 0.04 + 0.96 * (1 - Math.pow(1 - gk, 4));
      if (anim.current) {
        const k = Math.min(1, (now - anim.current.t0) / 1100);
        const e = 1 - Math.pow(1 - k, 3);
        const { from, to } = anim.current;
        rot.current = [from[0] + (to[0] - from[0]) * e, from[1] + (to[1] - from[1]) * e];
        if (k >= 1) anim.current = null;
      } else if (!drag.current && now > idleAt.current) {
        rot.current = [rot.current[0] + 0.035, rot.current[1]];
      }
      const availW = w - offsetX, availH = h - offsetY;
      const r = Math.max(20, Math.min(availW, availH) * 0.4 * zoom.current * scale);
      const cx = offsetX + availW / 2, cy = availH / 2;
      proj.scale(r).translate([cx, cy]).rotate([rot.current[0], rot.current[1], 0]);
      const pixelPosition = (id: string, coordinates: [number, number]): PixelPoint | null => {
        const point = proj(coordinates);
        if (!point) return null;
        const offset = pinOffsets.get(id) ?? { x: 0, y: 0 };
        return [point[0] + offset.x, point[1] + offset.y];
      };
      const visiblePinPoints = (excludedIds: string[]): PixelPoint[] => {
        const people = [
          ...(me ? [{ id: "me", coordinates: [me.lng, me.lat] as [number, number] }] : []),
          ...peers.map((peer) => ({ id: peer.id, coordinates: [peer.lng, peer.lat] as [number, number] })),
        ];
        return people.flatMap(({ id, coordinates }) => {
          if (excludedIds.includes(id)) return [];
          const point = pixelPosition(id, coordinates);
          return !point || point[0] < -50 || point[0] > w + 50 || point[1] < -50 || point[1] > h + 50 ? [] : [point];
        });
      };
      const strokePixels = (points: PixelPoint[]) => {
        if (points.length < 2) return;
        ctx.beginPath();
        ctx.moveTo(points[0][0], points[0][1]);
        for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
        ctx.stroke();
      };
      const drawEndpointDots = (points: PixelPoint[], color: string) => {
        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = 12;
        ctx.fillStyle = color;
        for (const [x, y] of points) {
          ctx.beginPath();
          ctx.arc(x, y, 3, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      };

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // soft ground shadow
      const radioBlue = theme === "radio-blue";
      const sh = ctx.createRadialGradient(cx, cy + r * 1.02, r * 0.1, cx, cy + r * 1.02, r * 1.05);
      sh.addColorStop(0, radioBlue ? "rgba(0,0,20,0.36)" : "rgba(92,60,35,0.16)");
      sh.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = sh;
      ctx.beginPath();
      ctx.ellipse(cx, cy + r * 1.02, r * 0.9, r * 0.12, 0, 0, Math.PI * 2);
      ctx.fill();

      const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
      g.addColorStop(0, radioBlue ? "#252a36" : "#fffaf2");
      g.addColorStop(0.7, radioBlue ? "#171b25" : "#f3e8d8");
      g.addColorStop(1, radioBlue ? "#10131c" : "#e7d6bf");
      ctx.fillStyle = g;
      ctx.beginPath();
      path({ type: "Sphere" });
      ctx.fill();

      ctx.strokeStyle = radioBlue ? "rgba(255,255,255,0.11)" : "rgba(120,84,55,0.05)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      path(graticule);
      ctx.stroke();

      // view vector
      const lam = (-rot.current[0] * Math.PI) / 180, phi = (-rot.current[1] * Math.PI) / 180;
      const vx = Math.cos(phi) * Math.cos(lam), vy = Math.cos(phi) * Math.sin(lam), vz = Math.sin(phi);
      const ds = Math.max(0.85, r / 300);
      for (const d of dots) {
        const dot = d[2] * vx + d[3] * vy + d[4] * vz;
        if (dot <= 0.02) continue;
        const p = proj([d[0], d[1]]);
        if (!p) continue;
        ctx.fillStyle = radioBlue ? `rgba(92,255,138,${0.25 + dot * 0.3})` : `rgba(122,82,52,${0.22 + dot * 0.55})`;
        const s = (radioBlue ? 1.3 + dot * 1.25 : 0.9 + dot * 1.1) * ds;
        ctx.fillRect(p[0] - s / 2, p[1] - s / 2, s, s);
      }

      ctx.strokeStyle = radioBlue ? "rgba(255,255,255,0.15)" : "rgba(122,82,52,0.22)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      path({ type: "Sphere" });
      ctx.stroke();

      if (me && arcTo) {
        const selectedColor = radioBlue ? "#5cff8a" : "#b5602f";
        ctx.setLineDash([5, 6]);
        ctx.lineDashOffset = -now / 40;
        ctx.strokeStyle = selectedColor;
        ctx.lineWidth = 2;
        if (selectedIsNear) {
          const a = pixelPosition("me", [me.lng, me.lat]);
          const b = pixelPosition(arcTo.id, [arcTo.lng, arcTo.lat]);
          if (a && b) {
            const screen = screenBridgeArc(a, b, visiblePinPoints(["me", arcTo.id]), 40, 18, 24);
            strokePixels(screen.points);
            drawEndpointDots([screen.from, screen.to], selectedColor);
          }
        } else {
          ctx.beginPath();
          path({ type: "LineString", coordinates: selectedLongArc });
          ctx.stroke();
        }
        ctx.setLineDash([]);
      }

      const arcGlow = radioBlue ? "#8b5cf6" : "#c9783f";
      const arcCore = radioBlue ? "#c4b5fd" : "#c9783f";
      for (const arc of liveArcs) {
        let screen: ReturnType<typeof screenBridgeArc> | null = null;
        ctx.save();
        ctx.shadowColor = arcGlow;
        ctx.shadowBlur = 10;
        ctx.strokeStyle = arcGlow;
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = 6;
        if (nearLiveArcIds.has(arc.id)) {
          const a = pixelPosition(arc.fromId, arc.from);
          const b = pixelPosition(arc.toId, arc.to);
          if (!a || !b) {
            ctx.restore();
            continue;
          }
          screen = screenBridgeArc(a, b, visiblePinPoints([arc.fromId, arc.toId]));
          strokePixels(screen.points);
        } else {
          ctx.beginPath();
          path({ type: "LineString", coordinates: longLiveArcCoordinates.get(arc.id) ?? [] });
          ctx.stroke();
        }
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
        ctx.strokeStyle = arcCore;
        ctx.lineWidth = 1.5;
        if (screen) {
          strokePixels(screen.points);
          drawEndpointDots([screen.from, screen.to], arcCore);
        } else {
          ctx.beginPath();
          path({ type: "LineString", coordinates: longLiveArcCoordinates.get(arc.id) ?? [] });
          ctx.stroke();
        }
        ctx.restore();
      }

      const place = (id: string, lng: number, lat: number) => {
        const m = markers.current.get(id);
        if (!m) return;
        const offset = pinOffsets.get(id) ?? { x: 0, y: 0 };
        const la = (lat * Math.PI) / 180, lo = (lng * Math.PI) / 180;
        const dot = Math.cos(la) * Math.cos(lo) * vx + Math.cos(la) * Math.sin(lo) * vy + Math.sin(la) * vz;
        const p = proj([lng, lat]);
        m.style.opacity = p ? (dot > 0.05 ? String(Math.min(1, dot * 3)) : "0.42") : "0";
        m.style.pointerEvents = p ? "auto" : "none";
        if (p) m.style.transform = `translate(${p[0] + offset.x}px, ${p[1] + offset.y}px) translate(-50%, -50%) scale(${0.8 + Math.max(0, dot) * 0.2})`;
      };
      if (me) place("me", me.lng, me.lat);
      for (const p of peers) place(p.id, p.lng, p.lat);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    pointers.current.set(e.pointerId, [e.clientX, e.clientY]);
    anim.current = null;
    if (pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { distance: Math.max(1, Math.hypot(a[0] - b[0], a[1] - b[1])), zoom: zoom.current };
      drag.current = null;
    } else {
      drag.current = { x: e.clientX, y: e.clientY, r: [...rot.current] as [number, number] };
    }
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, [e.clientX, e.clientY]);
    if (pointers.current.size >= 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.max(1, Math.hypot(a[0] - b[0], a[1] - b[1]));
      zoom.current = Math.max(0.7, Math.min(8, pinch.current.zoom * (distance / pinch.current.distance)));
      return;
    }
    const d = drag.current;
    if (!d) return;
    const k = 0.28 / zoom.current;
    rot.current = [d.r[0] + (e.clientX - d.x) * k, Math.max(-70, Math.min(70, d.r[1] - (e.clientY - d.y) * k))];
  };
  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    pinch.current = null;
    const remaining = [...pointers.current.values()][0];
    drag.current = remaining ? { x: remaining[0], y: remaining[1], r: [...rot.current] as [number, number] } : null;
    idleAt.current = performance.now() + 4000;
  };
  const onWheel = (e: React.WheelEvent) => {
    zoom.current = Math.max(0.7, Math.min(8, zoom.current * (e.deltaY > 0 ? 0.92 : 1.08)));
  };

  const setRef = (id: string) => (node: HTMLButtonElement | null) => {
    if (node) markers.current.set(id, node);
    else markers.current.delete(id);
  };

  return (
    <div ref={wrap} className="globe" onClick={() => onSelect(null)} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onWheel={onWheel}>
      <canvas ref={canvas} aria-label="Globe of people online" />
      {me && (
        <button ref={setRef("me")} className="pin pin-me fb" tabIndex={-1} aria-label="You">
          <img className="pin-face" src={avatarUrl(me.avatar)} alt="" draggable={false} />
          <span className="pin-label">You</span>
        </button>
      )}
      {peers.map((p) => (
        <button
          key={p.id}
          ref={setRef(p.id)}
          className={`pin fb ${latePeerIds.current.has(p.id) ? "pin-late" : ""} ${selectedId === p.id ? "is-selected" : ""} ${p.status === "busy" ? "is-busy" : ""} ${p.status === "matching" ? "is-matching" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(p.id);
          }}
          aria-label={`${p.name} in ${p.city}`}
        >
          <span className="pin-pulse" />
          <img className="pin-face" src={avatarUrl(p.avatar)} alt="" draggable={false} />
          <span className="pin-dot" />
          <span className="pin-label">{p.status === "busy" ? `${p.name} · talking` : `${p.name} · ${p.city}`}</span>
        </button>
      ))}
    </div>
  );
});

export default FallbackGlobe;
