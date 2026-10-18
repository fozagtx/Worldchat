import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import maplibregl, { type Map as MlMap, type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Peer, Profile } from "../lib/protocol";
import { avatarUrl } from "../lib/identity";
import { greatCircle } from "../lib/geo";

export interface GlobeHandle {
  focus: (lat: number, lng: number) => void;
}

interface Props {
  me: Profile | null;
  peers: Peer[];
  selectedId: string | null;
  arcTo: Peer | null;
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

async function loadStyle(): Promise<StyleSpecification> {
  const res = await fetch("https://tiles.openfreemap.org/styles/positron");
  const style = (await res.json()) as StyleSpecification;
  const keep = /^(background|water$|boundary_2|boundary_3|boundary_disputed|label_country|label_city_capital|label_city$|water_name_point_label)/;
  style.layers = style.layers
    .filter((l) => keep.test(l.id))
    .map((l) => {
      const layer = JSON.parse(JSON.stringify(l));
      if (layer.type === "background") layer.paint = { "background-color": LAND };
      if (layer.id === "water") layer.paint = { "fill-color": WATER, "fill-antialias": true };
      if (layer.type === "line") layer.paint = { ...layer.paint, "line-color": "#c8ae92", "line-opacity": 0.85 };
      if (layer.type === "symbol") {
        const water = layer.id.startsWith("water");
        layer.paint = {
          "text-color": water ? "#a88a6d" : layer.id.startsWith("label_country") ? INK : "#8c6c55",
          "text-halo-color": water ? WATER : LAND,
          "text-halo-width": 1.2,
        };
        if (layer.id.startsWith("label_city")) layer.minzoom = 3.2;
      }
      return layer;
    });
  style.projection = { type: "globe" };
  style.sky = { "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 5, 1, 7, 0], "sky-color": "#f4ede3", "horizon-color": "#efe2cf", "fog-color": "#f4ede3" } as StyleSpecification["sky"];
  return style;
}

function markerEl(cls: string) {
  const el = document.createElement("button");
  el.className = `pin ${cls}`;
  el.innerHTML = `<span class="pin-pulse"></span><img class="pin-face" alt="" draggable="false"/><span class="pin-dot"></span><span class="pin-label"></span>`;
  return el;
}

const MapGlobe = forwardRef<GlobeHandle, Props>(function MapGlobe({ me, peers, selectedId, arcTo, padding, paused, revealed, onReady, onSelect }, ref) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const ready = useRef(false);
  const markers = useRef(new Map<string, maplibregl.Marker>());
  const idleUntil = useRef(0);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const arcAnim = useRef<{ key: string; t0: number } | null>(null);
  const targetZoom = () => (window.innerWidth < 760 ? 1.0 : 1.95);
  const latest = useRef({ me, peers, selectedId, arcTo });
  latest.current = { me, peers, selectedId, arcTo };

  useImperativeHandle(ref, () => ({
    focus(lat, lng) {
      idleUntil.current = performance.now() + 9000;
      // BFCM-style: swoop in and tilt so the person sits on the horizon
      map.current?.flyTo({ center: [lng, lat - 4], zoom: Math.max(map.current.getZoom(), 2.6), pitch: 38, bearing: 0, duration: 1800, curve: 1.6, essential: true });
    },
  }));

  const sync = () => {
    const m = map.current;
    if (!m || !ready.current) return;
    const { me, peers, selectedId, arcTo } = latest.current;
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
    for (const [id, mk] of markers.current) if (!want.has(id)) (mk.remove(), markers.current.delete(id));
    for (const [id, w] of want) {
      let mk = markers.current.get(id);
      if (!mk) {
        const el = markerEl("");
        if (id !== "me")
          el.addEventListener("click", (e) => {
            e.stopPropagation();
            onSelectRef.current(id);
          });
        mk = new maplibregl.Marker({ element: el, anchor: "center", opacityWhenCovered: "0" }).setLngLat([w.lng, w.lat]).addTo(m);
        markers.current.set(id, mk);
      }
      mk.setLngLat([w.lng, w.lat]);
      const el = mk.getElement();
      el.className = `pin ${w.cls}${id === "me" ? " pin-me" : ""}`;
      const img = el.querySelector<HTMLImageElement>(".pin-face")!;
      const src = avatarUrl(w.seed);
      if (img.src !== src) img.src = src;
      el.querySelector(".pin-label")!.textContent = w.label;
      el.setAttribute("aria-label", w.label);
    }
    const key = me && arcTo ? `${arcTo.id}` : "";
    if (!arcAnim.current || arcAnim.current.key !== key) arcAnim.current = { key, t0: performance.now() };
    drawArc();
  };

  const drawArc = () => {
    const m = map.current;
    const src = m?.getSource("arc") as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    const { me, arcTo } = latest.current;
    const full = me && arcTo ? greatCircle([me.lng, me.lat], [arcTo.lng, arcTo.lat]) : [];
    const k = arcAnim.current ? Math.min(1, (performance.now() - arcAnim.current.t0) / 900) : 1;
    const n = Math.max(2, Math.ceil(full.length * (1 - Math.pow(1 - k, 3))));
    src.setData({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: full.slice(0, n) } });
    if (k < 1) requestAnimationFrame(drawArc);
  };

  useEffect(() => {
    let raf = 0;
    let cancelled = false;
    void loadStyle().then((style) => {
      if (cancelled || !box.current) return;
      const start = latest.current.me;
      const m = new maplibregl.Map({
        container: box.current,
        style,
        center: start ? [start.lng, Math.max(-30, Math.min(40, start.lat))] : [10, 20],
        zoom: -1.5,
        minZoom: -2,
        maxZoom: 6,
        attributionControl: { compact: true },
        renderWorldCopies: false,
      });
      map.current = m;
      m.on("load", () => {
        m.addSource("arc", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [] } } });
        m.addLayer({ id: "arc", type: "line", source: "arc", paint: { "line-color": "#b5602f", "line-width": 2.2, "line-dasharray": [1.5, 1.5] }, layout: { "line-cap": "round" } });
        ready.current = true;
        sync();
        onReadyRef.current();
      });
      m.on("click", () => onSelectRef.current(null));
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
      map.current?.remove();
      map.current = null;
      ready.current = false;
      markers.current.clear();
    };
  }, []);

  useEffect(sync, [me, peers, selectedId, arcTo]);

  useEffect(() => {
    const m = map.current;
    if (!revealed || !m) return;
    idleUntil.current = performance.now() + 2600;
    const c = m.getCenter();
    m.easeTo({ zoom: targetZoom(), center: [c.lng + 25, c.lat], duration: 2400, easing: (t) => 1 - Math.pow(1 - t, 4) });
  }, [revealed]);

  useEffect(() => {
    map.current?.easeTo({ padding, duration: 600 });
  }, [padding.left, padding.right, padding.top, padding.bottom]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={box} className="map" />;
});

export default MapGlobe;
