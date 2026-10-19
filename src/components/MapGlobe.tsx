import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import maplibregl, { type Map as MlMap, type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Peer, Profile } from "../lib/protocol";
import type { ThemeId } from "../lib/theme";
import { avatarUrl } from "../lib/identity";
import { distanceKm, fanOutOffsets, greatCircle, screenBridgeArc, type LiveArc, type PixelPoint } from "../lib/geo";

export interface GlobeHandle {
  focus: (lat: number, lng: number) => void;
  locate: (lat: number, lng: number) => void;
}

interface Props {
  me: Profile | null;
  peers: Peer[];
  liveArcs: LiveArc[];
  selectedId: string | null;
  arcTo: Peer | null;
  theme: ThemeId;
  padding: { left: number; right: number; top: number; bottom: number };
  paused: boolean;
  revealed: boolean;
  onReady: () => void;
  onSelect: (id: string | null) => void;
}

export function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

const LAND = "#f7f0e5";
const WATER = "#e4d4bf";
const INK = "#6b4b35";

async function loadStyle(theme: ThemeId): Promise<StyleSpecification> {
  const res = await fetch("https://tiles.openfreemap.org/styles/positron");
  const style = (await res.json()) as StyleSpecification;
  const radioBlue = theme === "radio-blue";
  const keep = /^(background|water$|boundary_2|boundary_3|boundary_disputed|label_country|label_city_capital|label_city$|water_name_point_label)/;
  style.layers = style.layers
    .filter((l) => keep.test(l.id) && !(radioBlue && l.id === "water"))
    .map((l) => {
      const layer = JSON.parse(JSON.stringify(l));
      if (layer.type === "background") layer.paint = { "background-color": radioBlue ? "#07080d" : LAND };
      if (layer.id === "water") layer.paint = { "fill-color": WATER, "fill-antialias": true };
      if (layer.type === "line") layer.paint = { ...layer.paint, "line-color": radioBlue ? "rgba(255,255,255,0.35)" : "#c8ae92", "line-opacity": 0.85 };
      if (layer.type === "symbol") {
        const water = layer.id.startsWith("water");
        layer.paint = {
          "text-color": radioBlue ? "rgba(255,255,255,0.85)" : water ? "#a88a6d" : layer.id.startsWith("label_country") ? INK : "#8c6c55",
          "text-halo-color": radioBlue ? "rgba(7,8,13,0.96)" : water ? WATER : LAND,
          "text-halo-width": radioBlue ? 1.8 : 1.2,
        };
        if (layer.id.startsWith("label_city")) layer.minzoom = 3.2;
      }
      return layer;
    });
  if (radioBlue) {
    style.sources["radio-imagery"] = {
      type: "raster",
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      maxzoom: 18,
      attribution: "Esri, Maxar, Earthstar Geographics",
    };
    const background = style.layers.findIndex((layer) => layer.type === "background");
    style.layers.splice(background < 0 ? 0 : background + 1, 0, {
      id: "radio-imagery",
      type: "raster",
      source: "radio-imagery",
      minzoom: 0,
      maxzoom: 18,
      paint: { "raster-opacity": 1 },
    });
  }
  style.projection = { type: "globe" };
  style.sky = radioBlue
    ? { "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 5, 1, 7, 0], "sky-color": "#07080d", "horizon-color": "#0d1530", "fog-color": "#07080d" }
    : { "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 5, 1, 7, 0], "sky-color": "#f4ede3", "horizon-color": "#efe2cf", "fog-color": "#f4ede3" };
  return style;
}

function markerEl(cls: string) {
  const el = document.createElement("button");
  el.className = `pin ${cls}`;
  el.innerHTML = `<span class="pin-pulse"></span><img class="pin-face" alt="" draggable="false"/><span class="pin-dot"></span><span class="pin-label"></span>`;
  return el;
}

const MapGlobe = forwardRef<GlobeHandle, Props>(function MapGlobe({ me, peers, liveArcs, selectedId, arcTo, theme, padding, paused, revealed, onReady, onSelect }, ref) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const ready = useRef(false);
  const markers = useRef(new Map<string, maplibregl.Marker>());
  const pinOffsets = useRef(new Map<string, { x: number; y: number }>());
  const idleUntil = useRef(0);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const arcAnim = useRef<{ key: string; t0: number } | null>(null);
  const selectedLongCoordinates = useRef<{ key: string; coordinates: [number, number][] } | null>(null);
  const selectedArcIsNear = useRef(false);
  const liveArcStarts = useRef(new Map<string, number>());
  const liveArcIsNear = useRef(new Map<string, boolean>());
  const liveArcCoordinates = useRef(new Map<string, [number, number][]>());
  const liveArcEndpoints = useRef(new Map<string, { coordinates: [number, number][]; opacity: number }>());
  const liveArcRaf = useRef(0);
  const nearArcRaf = useRef(0);
  const nearArcViewKey = useRef("");
  const initialView = useRef(false);
  const targetZoom = () => (window.innerWidth < 760 ? 1.0 : 1.95);
  const latest = useRef({ me, peers, liveArcs, selectedId, arcTo, theme, padding, revealed });
  latest.current = { me, peers, liveArcs, selectedId, arcTo, theme, padding, revealed };

  const pixelPosition = (m: MlMap, id: string, coordinates: [number, number]): PixelPoint => {
    const point = m.project(coordinates);
    const offset = pinOffsets.current.get(id) ?? { x: 0, y: 0 };
    return [point.x + offset.x, point.y + offset.y];
  };

  const visiblePinPoints = (m: MlMap, excludedIds: string[]): PixelPoint[] => {
    const { me, peers } = latest.current;
    const people = [
      ...(me ? [{ id: "me", coordinates: [me.lng, me.lat] as [number, number] }] : []),
      ...peers.map((peer) => ({ id: peer.id, coordinates: [peer.lng, peer.lat] as [number, number] })),
    ];
    const width = m.getContainer().clientWidth;
    const height = m.getContainer().clientHeight;
    return people.flatMap(({ id, coordinates }) => {
      if (excludedIds.includes(id)) return [];
      const element = markers.current.get(id)?.getElement();
      if (!element || element.style.visibility === "hidden" || Number.parseFloat(element.style.opacity || "1") < 0.05) return [];
      const point = pixelPosition(m, id, coordinates);
      return point[0] < -50 || point[0] > width + 50 || point[1] < -50 || point[1] > height + 50 ? [] : [point];
    });
  };

  const screenToGeo = (m: MlMap, points: PixelPoint[]): [number, number][] =>
    points.map((point) => {
      const { lng, lat } = m.unproject(point);
      return [lng, lat];
    });

  const arcViewKey = (m: MlMap) => {
    const center = m.getCenter();
    const padding = m.getPadding();
    return [center.lng, center.lat, m.getZoom(), m.getBearing(), m.getPitch(), padding.top, padding.right, padding.bottom, padding.left, m.getContainer().clientWidth, m.getContainer().clientHeight].join(":");
  };

  useImperativeHandle(ref, () => ({
    focus(lat, lng) {
      idleUntil.current = performance.now() + 9000;
      // BFCM-style: swoop in and tilt so the person sits on the horizon
      map.current?.flyTo({ center: [lng, lat - 3], zoom: Math.max(map.current.getZoom(), 2.6), pitch: 32, bearing: 0, duration: 1800, curve: 1.6, essential: true });
    },
    locate(lat, lng) {
      idleUntil.current = performance.now() + 9000;
      map.current?.flyTo({ center: [lng, lat], zoom: targetZoom(), pitch: 0, bearing: 0, duration: 1200, essential: true });
    },
  }));

  const sync = () => {
    const m = map.current;
    if (!m || !ready.current) return;
    const { me, peers, selectedId, arcTo } = latest.current;
    selectedArcIsNear.current = Boolean(me && arcTo && distanceKm(me.lat, me.lng, arcTo.lat, arcTo.lng) < 1500);
    const want = new Map<string, { lng: number; lat: number; seed: string; label: string; cls: string }>();
    if (me) want.set("me", { lng: me.lng, lat: me.lat, seed: me.avatar, label: "You", cls: "pin-me" });
    for (const p of peers) {
      const busy = p.status !== "available";
      want.set(p.id, {
        lng: p.lng,
        lat: p.lat,
        seed: p.avatar,
        label: p.status === "busy" ? `${p.name} · talking` : p.status === "matching" ? `${p.name} · matching` : `${p.name} · ${p.city}`,
        cls: `${busy ? "is-busy" : ""} ${p.status === "matching" ? "is-matching" : ""} ${selectedId === p.id ? "is-selected" : ""}`,
      });
    }
    const offsets = fanOutOffsets([...want].map(([id, p]) => ({ id, lat: p.lat, lng: p.lng })));
    pinOffsets.current = offsets;
    for (const [id, mk] of markers.current) if (!want.has(id)) (mk.remove(), markers.current.delete(id));
    for (const [id, w] of want) {
      let mk = markers.current.get(id);
      if (!mk) {
        const el = markerEl("");
        if (id !== "me" && latest.current.revealed) el.classList.add("pin-late");
        if (id !== "me")
          el.addEventListener("click", (e) => {
            e.stopPropagation();
            onSelectRef.current(id);
          });
        mk = new maplibregl.Marker({ element: el, anchor: "center", opacityWhenCovered: "0.42" }).setLngLat([w.lng, w.lat]).addTo(m);
        markers.current.set(id, mk);
      }
      mk.setLngLat([w.lng, w.lat]);
      const el = mk.getElement();
      el.classList.remove("is-busy", "is-matching", "is-selected", "pin-me");
      el.classList.add("pin", ...w.cls.split(/\s+/).filter(Boolean));
      if (id === "me") el.classList.add("pin-me");
      const offset = offsets.get(id);
      el.style.translate = `${offset?.x ?? 0}px ${offset?.y ?? 0}px`;
      const img = el.querySelector<HTMLImageElement>(".pin-face")!;
      const src = avatarUrl(w.seed);
      if (img.src !== src) img.src = src;
      el.querySelector(".pin-label")!.textContent = w.label;
      el.setAttribute("aria-label", w.label);
    }
    const key = me && arcTo ? `${arcTo.id}` : "";
    if (!arcAnim.current || arcAnim.current.key !== key) arcAnim.current = { key, t0: performance.now() };
    drawArc();
    drawLiveArcs();
    nearArcViewKey.current = arcViewKey(m);
  };

  const screenArcFor = (
    m: MlMap,
    fromId: string,
    from: [number, number],
    toId: string,
    to: [number, number],
    fromRadius = 24,
    toRadius = 24,
  ) => {
    const screenPathVisible = (points: readonly PixelPoint[]) => {
      const stride = Math.max(1, Math.floor((points.length - 1) / 8));
      for (let i = 0; i < points.length; i += stride) {
        const point = points[i];
        const projected = m.project(m.unproject(point));
        if (Math.hypot(projected.x - point[0], projected.y - point[1]) > 2) return false;
      }
      const last = points[points.length - 1];
      const projected = m.project(m.unproject(last));
      return Math.hypot(projected.x - last[0], projected.y - last[1]) <= 2;
    };
    return screenBridgeArc(
      pixelPosition(m, fromId, from),
      pixelPosition(m, toId, to),
      visiblePinPoints(m, [fromId, toId]),
      40,
      fromRadius,
      toRadius,
      screenPathVisible,
    );
  };

  const setPointData = (m: MlMap, sourceId: string, points: [number, number][], opacity = 1) => {
    const source = m.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
    source?.setData({
      type: "FeatureCollection",
      features: points.map((coordinates) => ({
        type: "Feature" as const,
        properties: { opacity },
        geometry: { type: "Point" as const, coordinates },
      })),
    });
  };

  const drawArc = (nearOnly = false) => {
    const m = map.current;
    const src = m?.getSource("arc") as maplibregl.GeoJSONSource | undefined;
    if (!m || !src) return;
    const { me, arcTo } = latest.current;
    const near = selectedArcIsNear.current;
    if (nearOnly && !near) return;
    let full: [number, number][] = [];
    let endpoints: [number, number][] = [];
    if (me && arcTo) {
      if (near) {
        const screen = screenArcFor(m, "me", [me.lng, me.lat], arcTo.id, [arcTo.lng, arcTo.lat], 18, 24);
        full = screenToGeo(m, screen.points);
        endpoints = screenToGeo(m, [screen.from, screen.to]);
      } else {
        const pathKey = `${me.lng}:${me.lat}:${arcTo.id}:${arcTo.lng}:${arcTo.lat}`;
        if (selectedLongCoordinates.current?.key !== pathKey) {
          selectedLongCoordinates.current = { key: pathKey, coordinates: greatCircle([me.lng, me.lat], [arcTo.lng, arcTo.lat]) };
        }
        full = selectedLongCoordinates.current.coordinates;
      }
    }
    const k = arcAnim.current ? Math.min(1, (performance.now() - arcAnim.current.t0) / 900) : 1;
    const n = Math.max(2, Math.ceil(full.length * (1 - Math.pow(1 - k, 3))));
    src.setData({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: full.slice(0, n) } });
    setPointData(m, "arc-endpoints", endpoints);
    if (k < 1) requestAnimationFrame(() => drawArc());
  };

  const drawLiveArcs = (rebuildLong = true) => {
    const m = map.current;
    const source = m?.getSource("live-arcs") as maplibregl.GeoJSONSource | undefined;
    if (!m || !source) return;
    const arcs = latest.current.liveArcs;
    const ids = new Set(arcs.map((arc) => arc.id));
    for (const id of liveArcStarts.current.keys()) {
      if (ids.has(id)) continue;
      liveArcStarts.current.delete(id);
      liveArcIsNear.current.delete(id);
      liveArcCoordinates.current.delete(id);
      liveArcEndpoints.current.delete(id);
    }
    const now = performance.now();
    let animating = false;
    const features = arcs.map((arc) => {
      const startedAt = liveArcStarts.current.get(arc.id) ?? now;
      liveArcStarts.current.set(arc.id, startedAt);
      const opacity = Math.min(1, (now - startedAt) / 700);
      if (opacity < 1) animating = true;
      if (rebuildLong || !liveArcIsNear.current.has(arc.id)) {
        liveArcIsNear.current.set(arc.id, distanceKm(arc.from[1], arc.from[0], arc.to[1], arc.to[0]) < 1500);
      }
      if (liveArcIsNear.current.get(arc.id)) {
        const screen = screenArcFor(m, arc.fromId, arc.from, arc.toId, arc.to);
        liveArcCoordinates.current.set(arc.id, screenToGeo(m, screen.points));
        liveArcEndpoints.current.set(arc.id, { coordinates: screenToGeo(m, [screen.from, screen.to]), opacity });
      } else {
        liveArcEndpoints.current.delete(arc.id);
        if (rebuildLong || !liveArcCoordinates.current.has(arc.id)) {
          liveArcCoordinates.current.set(arc.id, greatCircle(arc.from, arc.to));
        }
      }
      return {
        type: "Feature" as const,
        properties: { opacity },
        geometry: {
          type: "LineString" as const,
          coordinates: liveArcCoordinates.current.get(arc.id) ?? [],
        },
      };
    });
    source.setData({ type: "FeatureCollection", features });
    const endpointSource = m.getSource("live-arc-endpoints") as maplibregl.GeoJSONSource | undefined;
    endpointSource?.setData({
      type: "FeatureCollection",
      features: [...liveArcEndpoints.current.values()].flatMap(({ coordinates, opacity }) =>
        coordinates.map((geometryCoordinates) => ({
          type: "Feature" as const,
          properties: { opacity },
          geometry: { type: "Point" as const, coordinates: geometryCoordinates },
        })),
      ),
    });
    if (animating && !liveArcRaf.current) {
      liveArcRaf.current = requestAnimationFrame(() => {
        liveArcRaf.current = 0;
        drawLiveArcs(false);
      });
    }
  };

  const queueNearArcUpdate = () => {
    if (!ready.current || nearArcRaf.current) return;
    nearArcRaf.current = requestAnimationFrame(() => {
      nearArcRaf.current = 0;
      const m = map.current;
      if (!m || !ready.current) return;
      const viewKey = arcViewKey(m);
      if (viewKey === nearArcViewKey.current) return;
      drawArc(true);
      drawLiveArcs(false);
      nearArcViewKey.current = viewKey;
    });
  };

  useEffect(() => {
    let raf = 0;
    let cancelled = false;
    void loadStyle(theme).then(async (loadedStyle) => {
      if (cancelled || !box.current) return;
      const style = latest.current.theme === theme ? loadedStyle : await loadStyle(latest.current.theme);
      if (cancelled || !box.current) return;
      const start = latest.current.me;
      const m = new maplibregl.Map({
        container: box.current,
        style,
        center: start ? [start.lng, Math.max(-30, Math.min(40, start.lat))] : [10, 20],
        zoom: -1.5,
        minZoom: -2,
        maxZoom: 18,
        attributionControl: { compact: true },
        renderWorldCopies: false,
      });
      map.current = m;
      const ro = new ResizeObserver(() => m.resize());
      ro.observe(box.current);
      m.once("remove", () => ro.disconnect());
      const ensureArc = () => {
        const color = latest.current.theme === "radio-blue" ? "#5cff8a" : "#b5602f";
        if (!m.getSource("arc")) m.addSource("arc", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [] } } });
        if (!m.getLayer("arc")) m.addLayer({ id: "arc", type: "line", source: "arc", paint: { "line-color": color, "line-width": 2.2, "line-dasharray": [1.5, 1.5] }, layout: { "line-cap": "round" } });
        else m.setPaintProperty("arc", "line-color", color);
        if (!m.getSource("arc-endpoints")) m.addSource("arc-endpoints", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        if (!m.getLayer("arc-endpoints-glow")) m.addLayer({
          id: "arc-endpoints-glow",
          type: "circle",
          source: "arc-endpoints",
          paint: { "circle-radius": 8, "circle-color": color, "circle-blur": 0.8, "circle-opacity": 0.45 },
        });
        if (!m.getLayer("arc-endpoints-core")) m.addLayer({
          id: "arc-endpoints-core",
          type: "circle",
          source: "arc-endpoints",
          paint: { "circle-radius": 3, "circle-color": color, "circle-blur": 0.25 },
        });
        else m.setPaintProperty("arc-endpoints-core", "circle-color", color);
        if (m.getLayer("arc")) m.moveLayer("arc");
        if (m.getLayer("arc-endpoints-glow")) m.moveLayer("arc-endpoints-glow");
        if (m.getLayer("arc-endpoints-core")) m.moveLayer("arc-endpoints-core");
      };
      const ensureLiveArcs = () => {
        if (!m.getSource("live-arcs")) m.addSource("live-arcs", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        if (!m.getSource("live-arc-endpoints")) m.addSource("live-arc-endpoints", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        const glow = latest.current.theme === "radio-blue" ? "#8b5cf6" : "#c9783f";
        const core = latest.current.theme === "radio-blue" ? "#c4b5fd" : "#b5602f";
        if (!m.getLayer("live-arcs-glow")) {
          m.addLayer({
            id: "live-arcs-glow",
            type: "line",
            source: "live-arcs",
            layout: { "line-cap": "round", "line-join": "round" },
            paint: { "line-color": glow, "line-width": 12, "line-blur": 6, "line-opacity": ["*", ["get", "opacity"], 0.85] },
          });
        }
        if (!m.getLayer("live-arcs-core")) {
          m.addLayer({
            id: "live-arcs-core",
            type: "line",
            source: "live-arcs",
            layout: { "line-cap": "round", "line-join": "round" },
            paint: { "line-color": core, "line-width": 3, "line-opacity": ["get", "opacity"] },
          });
        }
        if (!m.getLayer("live-arc-endpoints-glow")) {
          m.addLayer({
            id: "live-arc-endpoints-glow",
            type: "circle",
            source: "live-arc-endpoints",
            paint: {
              "circle-radius": 8,
              "circle-color": glow,
              "circle-blur": 0.8,
              "circle-opacity": ["*", ["get", "opacity"], 0.45],
            },
          });
        }
        if (!m.getLayer("live-arc-endpoints-core")) {
          m.addLayer({
            id: "live-arc-endpoints-core",
            type: "circle",
            source: "live-arc-endpoints",
            paint: {
              "circle-radius": 3,
              "circle-color": core,
              "circle-blur": 0.25,
              "circle-opacity": ["get", "opacity"],
            },
          });
        }
        if (m.getLayer("live-arcs-glow")) m.moveLayer("live-arcs-glow");
        if (m.getLayer("live-arcs-core")) m.moveLayer("live-arcs-core");
        if (m.getLayer("live-arc-endpoints-glow")) m.moveLayer("live-arc-endpoints-glow");
        if (m.getLayer("live-arc-endpoints-core")) m.moveLayer("live-arc-endpoints-core");
      };
      m.on("style.load", () => {
        ensureArc();
        ensureLiveArcs();
        if (ready.current) sync();
      });
      m.on("load", () => {
        ensureArc();
        ensureLiveArcs();
        ready.current = true;
        sync();
        onReadyRef.current();
      });
      m.on("click", () => onSelectRef.current(null));
      m.on("move", queueNearArcUpdate);
      m.on("render", queueNearArcUpdate);
      m.on("moveend", () => {
        if (!ready.current) return;
        drawArc();
        drawLiveArcs(false);
        nearArcViewKey.current = arcViewKey(m);
      });
      m.on("error", () => onReadyRef.current());
      const hold = () => (idleUntil.current = performance.now() + 6000);
      m.on("mousedown", hold);
      m.on("touchstart", hold);
      m.on("wheel", hold);
      m.on("dragstart", hold);
      const spin = () => {
        if (!pausedRef.current && performance.now() > idleUntil.current && !m.isMoving() && m.getZoom() < 3) {
          const c = m.getCenter();
          m.setCenter([c.lng + 0.04, c.lat]);
        }
        raf = requestAnimationFrame(spin);
      };
      raf = requestAnimationFrame(spin);
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      cancelAnimationFrame(liveArcRaf.current);
      cancelAnimationFrame(nearArcRaf.current);
      map.current?.remove();
      map.current = null;
      ready.current = false;
      markers.current.clear();
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    let cancelled = false;
    void loadStyle(theme).then(async (loadedStyle) => {
      const style = latest.current.theme === theme ? loadedStyle : await loadStyle(latest.current.theme);
      if (!cancelled) m.setStyle(style, { diff: false });
    });
    return () => {
      cancelled = true;
    };
  }, [theme]);

  useEffect(sync, [me, peers, liveArcs, selectedId, arcTo]);

  useEffect(() => {
    const m = map.current;
    const user = latest.current.me;
    if (!revealed || !m || !user) return;
    const firstReveal = !initialView.current;
    initialView.current = true;
    idleUntil.current = performance.now() + 2600;
    m.easeTo({
      zoom: firstReveal ? targetZoom() : m.getZoom(),
      center: [user.lng, user.lat],
      padding: latest.current.padding,
      duration: firstReveal ? 2400 : 1000,
      easing: (t) => 1 - Math.pow(1 - t, 4),
    });
  }, [revealed, me?.lat, me?.lng]);

  useEffect(() => {
    map.current?.easeTo({ padding, duration: 600 });
  }, [padding.left, padding.right, padding.top, padding.bottom]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={box} className="map" />;
});

export default MapGlobe;
