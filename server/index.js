import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { promises as fs } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { WebSocket, WebSocketServer } from "ws";

const DEFAULT_COLOR = "#8a5a3b";
const MAX_SIGNAL_BYTES = 64 * 1024;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/g;
const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};
const distDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist");

function send(socket, message) {
  if (socket.readyState !== WebSocket.OPEN) return;
  try {
    socket.send(JSON.stringify(message));
  } catch {
    socket.close();
  }
}

function cleanText(value, field, limit) {
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  const cleaned = value.replace(CONTROL_CHARACTERS, "").trim();
  if (cleaned.length > limit) throw new Error(`${field} must be ${limit} characters or fewer`);
  return cleaned;
}

function sanitizeProfile(profile) {
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
    throw new Error("profile must be an object");
  }

  const name = cleanText(profile.name, "name", 24);
  if (!name) throw new Error("name must be 1–24 characters");
  if (typeof profile.lat !== "number" || !Number.isFinite(profile.lat) || profile.lat < -90 || profile.lat > 90) {
    throw new Error("lat must be a number from -90 to 90");
  }
  if (typeof profile.lng !== "number" || !Number.isFinite(profile.lng) || profile.lng < -180 || profile.lng > 180) {
    throw new Error("lng must be a number from -180 to 180");
  }

  const color = typeof profile.color === "string" && /^#[0-9a-f]{6}$/i.test(profile.color)
    ? profile.color
    : DEFAULT_COLOR;
  const gender = ["m", "f", "x"].includes(profile.gender) ? profile.gender : "x";
  const seeking = ["any", "m", "f"].includes(profile.seeking) ? profile.seeking : "any";
  const interests = [];
  const seenInterests = new Set();
  if (Array.isArray(profile.interests)) {
    for (const value of profile.interests) {
      if (typeof value !== "string") continue;
      const interest = value.replace(CONTROL_CHARACTERS, "").trim().toLowerCase();
      if (!interest || interest.length > 20 || seenInterests.has(interest)) continue;
      seenInterests.add(interest);
      interests.push(interest);
      if (interests.length === 5) break;
    }
  }
  const avatar = typeof profile.avatar === "string" &&
    profile.avatar.length <= 32 &&
    /^[a-z0-9-]*$/.test(profile.avatar)
    ? profile.avatar
    : "";
  const cc = typeof profile.cc === "string" && /^[A-Z]{2}$/.test(profile.cc.toUpperCase())
    ? profile.cc.toUpperCase()
    : "";

  return {
    name,
    color,
    city: cleanText(profile.city ?? "", "city", 48),
    country: cleanText(profile.country ?? "", "country", 48),
    lat: Math.round(profile.lat * 10) / 10,
    lng: Math.round(profile.lng * 10) / 10,
    tz: cleanText(profile.tz ?? "", "tz", 64),
    gender,
    seeking,
    interests,
    avatar,
    cc,
  };
}

function contentTypeFor(filePath) {
  return CONTENT_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

export function createServer({
  port = process.env.PORT ? Number(process.env.PORT) : 8787,
  now = Date.now,
} = {}) {
  const peers = new Map();
  const connections = new Map();
  const matchQueue = [];
  const knockQueues = new Map();
  const lastPartner = new Map();
  const talkingEvents = new Map();
  const activityHistory = [];
  let matchSequence = 0;
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });

  const broadcast = (message, exceptSocket = null) => {
    for (const socket of wss.clients) {
      if (socket !== exceptSocket && connections.get(socket)?.id) send(socket, message);
    }
  };

  function removeMatchQueue(id) {
    const index = matchQueue.findIndex((entry) => entry.id === id);
    if (index !== -1) matchQueue.splice(index, 1);
  }

  function emitActivity(kind, participants) {
    const at = now();
    if (kind === "talking") {
      const pairKey = participants.map((peer) => peer.id).sort().join(":");
      for (const [key, emittedAt] of talkingEvents) {
        if (at - emittedAt >= 10_000) talkingEvents.delete(key);
      }
      const previousAt = talkingEvents.get(pairKey);
      if (previousAt !== undefined && at - previousAt < 10_000) return;
      talkingEvents.set(pairKey, at);
    }

    const first = participants[0];
    const event = {
      id: randomUUID(),
      kind,
      names: participants.map((peer) => peer.name),
      cc: first.cc,
      city: first.city,
      at,
    };
    activityHistory.push(event);
    if (activityHistory.length > 25) activityHistory.shift();
    broadcast({ type: "activity", event });
  }

  function sendKnocks(targetId) {
    const target = peers.get(targetId);
    if (!target) return;
    const knockers = knockQueues.get(targetId) || [];
    const names = knockers
      .slice(0, 3)
      .map((id) => peers.get(id)?.peer.name)
      .filter(Boolean);
    send(target.socket, { type: "knocks", count: knockers.length, names });
  }

  function notifyKnockQueue(targetId) {
    const knockers = knockQueues.get(targetId) || [];
    if (knockers.length === 0) knockQueues.delete(targetId);
    knockers.forEach((id, index) => {
      const knocker = peers.get(id);
      if (knocker) send(knocker.socket, { type: "queued", to: targetId, position: index + 1 });
    });
    sendKnocks(targetId);
  }

  function handOffKnocks(targetId) {
    const target = peers.get(targetId);
    const knockers = knockQueues.get(targetId);
    if (!target || !knockers?.length) return;

    let selected = null;
    let removedFromMatchQueue = false;
    for (let index = 0; index < knockers.length;) {
      const knocker = peers.get(knockers[index]);
      if (!knocker) {
        knockers.splice(index, 1);
        continue;
      }
      if (knocker.peer.status === "available" || knocker.peer.status === "matching") {
        knockers.splice(index, 1);
        selected = knocker;
        if (knocker.peer.status === "matching") {
          removeMatchQueue(knocker.peer.id);
          knocker.peer = { ...knocker.peer, status: "available" };
          broadcast({ type: "update", peer: knocker.peer });
          removedFromMatchQueue = true;
        }
        break;
      }
      index += 1;
    }

    notifyKnockQueue(targetId);
    if (selected) send(selected.socket, { type: "your-turn", peer: target.peer });
    if (removedFromMatchQueue) runMatching();
  }

  function queueOrder(a, b) {
    return a.at - b.at || a.order - b.order;
  }

  function canMatch(first, second, at) {
    if (first.peer.id === second.peer.id) return false;
    if (first.peer.seeking !== "any" && first.peer.seeking !== second.peer.gender) return false;
    if (second.peer.seeking !== "any" && second.peer.seeking !== first.peer.gender) return false;
    const firstRecent = lastPartner.get(first.peer.id);
    const secondRecent = lastPartner.get(second.peer.id);
    if (firstRecent?.id === second.peer.id && at - firstRecent.at < 30_000) return false;
    if (secondRecent?.id === first.peer.id && at - secondRecent.at < 30_000) return false;
    return true;
  }

  function matchPeers(firstEntry, secondEntry) {
    const first = peers.get(firstEntry.id);
    const second = peers.get(secondEntry.id);
    if (!first || !second) return;

    removeMatchQueue(firstEntry.id);
    removeMatchQueue(secondEntry.id);
    const at = now();
    lastPartner.set(firstEntry.id, { id: secondEntry.id, at });
    lastPartner.set(secondEntry.id, { id: firstEntry.id, at });
    first.peer = { ...first.peer, status: "busy" };
    second.peer = { ...second.peer, status: "busy" };
    broadcast({ type: "update", peer: first.peer });
    broadcast({ type: "update", peer: second.peer });

    const shared = first.peer.interests.filter((interest) => second.peer.interests.includes(interest));
    const firstOffers = queueOrder(firstEntry, secondEntry) <= 0;
    const callId = randomUUID();
    send(first.socket, {
      type: "matched",
      peer: second.peer,
      callId,
      role: firstOffers ? "offer" : "answer",
      shared,
    });
    send(second.socket, {
      type: "matched",
      peer: first.peer,
      callId,
      role: firstOffers ? "answer" : "offer",
      shared,
    });
    emitActivity("talking", [first.peer, second.peer]);
  }

  function runMatching() {
    const queued = [...matchQueue].sort((a, b) => a.order - b.order);
    for (const entry of queued) {
      if (!matchQueue.some((queuedEntry) => queuedEntry.id === entry.id)) continue;
      const first = peers.get(entry.id);
      if (!first || first.peer.status !== "matching") continue;
      const at = now();
      const candidates = matchQueue
        .filter((candidate) => candidate.id !== entry.id)
        .map((candidate) => ({ entry: candidate, peer: peers.get(candidate.id) }))
        .filter((candidate) => candidate.peer && canMatch(first, candidate.peer, at))
        .map((candidate) => ({
          ...candidate,
          shared: first.peer.interests.filter((interest) => candidate.peer.peer.interests.includes(interest)).length,
        }))
        .sort((a, b) => b.shared - a.shared || queueOrder(a.entry, b.entry));
      if (candidates.length > 0) matchPeers(entry, candidates[0].entry);
    }
  }

  const server = createHttpServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url || "/", "http://localhost");
      if (request.method === "GET" && requestUrl.pathname === "/healthz") {
        response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ ok: true, online: peers.size }));
        return;
      }

      if (request.method !== "GET" && request.method !== "HEAD") {
        response.writeHead(405, { allow: "GET, HEAD", "content-type": "text/plain; charset=utf-8" });
        response.end("Method Not Allowed");
        return;
      }

      const distStat = await fs.stat(distDirectory).catch(() => null);
      if (!distStat?.isDirectory()) {
        response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        response.end("Not found");
        return;
      }

      let pathname;
      try {
        pathname = decodeURIComponent(requestUrl.pathname);
      } catch {
        response.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
        response.end("Bad request");
        return;
      }

      const requestedFile = path.resolve(distDirectory, `.${pathname}`);
      if (requestedFile !== distDirectory && !requestedFile.startsWith(`${distDirectory}${path.sep}`)) {
        response.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
        response.end("Forbidden");
        return;
      }

      let filePath = requestedFile;
      let fileStat = await fs.stat(filePath).catch(() => null);
      if (fileStat?.isDirectory()) {
        filePath = path.join(filePath, "index.html");
        fileStat = await fs.stat(filePath).catch(() => null);
      }

      if (!fileStat?.isFile()) {
        filePath = path.join(distDirectory, "index.html");
        fileStat = await fs.stat(filePath).catch(() => null);
      }

      if (!fileStat?.isFile()) {
        response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        response.end("Not found");
        return;
      }

      response.writeHead(200, {
        "content-length": fileStat.size,
        "content-type": contentTypeFor(filePath),
      });
      if (request.method === "HEAD") {
        response.end();
        return;
      }
      createReadStream(filePath)
        .on("error", () => {
          if (!response.headersSent) response.writeHead(500);
          response.end();
        })
        .pipe(response);
    } catch {
      if (!response.headersSent) response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      response.end("Internal server error");
    }
  });

  server.on("upgrade", (request, socket, head) => {
    let pathname;
    try {
      pathname = new URL(request.url || "/", "http://localhost").pathname;
    } catch {
      socket.destroy();
      return;
    }
    if (pathname !== "/ws") {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (webSocket) => {
      wss.emit("connection", webSocket, request);
    });
  });

  wss.on("connection", (socket) => {
    const connection = { id: null };
    connections.set(socket, connection);
    socket.isAlive = true;
    socket.on("pong", () => {
      socket.isAlive = true;
    });
    socket.on("error", () => {});
    socket.on("message", (rawMessage, isBinary) => {
      if (isBinary) {
        send(socket, { type: "error", message: "messages must be JSON text" });
        return;
      }

      let message;
      try {
        message = JSON.parse(rawMessage.toString());
      } catch {
        send(socket, { type: "error", message: "invalid JSON" });
        return;
      }
      if (!message || typeof message !== "object" || Array.isArray(message)) {
        send(socket, { type: "error", message: "message must be an object" });
        return;
      }

      if (message.type !== "hello" && !connection.id) {
        send(socket, { type: "error", message: "say hello first" });
        return;
      }

      try {
        switch (message.type) {
          case "hello": {
            if (connection.id) {
              send(socket, { type: "error", message: "already said hello" });
              break;
            }
            const profile = sanitizeProfile(message.profile);
            const id = randomUUID();
            const peer = {
              id,
              ...profile,
              avatar: profile.avatar || id.slice(0, 8),
              status: "available",
              joinedAt: new Date(now()).toISOString(),
            };
            connection.id = peer.id;
            peers.set(peer.id, { peer, socket });
            const others = [...peers.values()]
              .filter((entry) => entry.peer.id !== peer.id)
              .map((entry) => entry.peer);
            send(socket, {
              type: "welcome",
              id: peer.id,
              peers: others,
              activity: [...activityHistory],
            });
            broadcast({ type: "join", peer }, socket);
            console.log(`[worldchat] join ${JSON.stringify(peer.name)}`);
            emitActivity("join", [peer]);
            break;
          }
          case "update": {
            const current = peers.get(connection.id);
            const profile = sanitizeProfile(message.profile);
            current.peer = {
              ...current.peer,
              ...profile,
              avatar: profile.avatar || current.peer.id.slice(0, 8),
            };
            broadcast({ type: "update", peer: current.peer });
            break;
          }
          case "status": {
            if (message.status !== "available" && message.status !== "busy") {
              send(socket, { type: "error", message: "status must be available or busy" });
              break;
            }
            removeMatchQueue(connection.id);
            const current = peers.get(connection.id);
            current.peer = { ...current.peer, status: message.status };
            broadcast({ type: "update", peer: current.peer });
            if (message.status === "available") handOffKnocks(connection.id);
            break;
          }
          case "match": {
            const current = peers.get(connection.id);
            current.peer = { ...current.peer, status: "matching" };
            if (!matchQueue.some((entry) => entry.id === connection.id)) {
              matchQueue.push({ id: connection.id, at: now(), order: matchSequence++ });
            }
            broadcast({ type: "update", peer: current.peer });
            runMatching();
            break;
          }
          case "unmatch": {
            removeMatchQueue(connection.id);
            const current = peers.get(connection.id);
            current.peer = { ...current.peer, status: "available" };
            broadcast({ type: "update", peer: current.peer });
            handOffKnocks(connection.id);
            break;
          }
          case "knock": {
            const to = typeof message.to === "string" ? message.to : "";
            if (to === connection.id) {
              send(socket, { type: "knock-error", to, reason: "self" });
              break;
            }
            const target = peers.get(to);
            if (!target) {
              send(socket, { type: "knock-error", to, reason: "offline" });
              break;
            }
            if (target.peer.status !== "busy" && target.peer.status !== "matching") {
              send(socket, { type: "knock-error", to, reason: "available" });
              break;
            }
            const knockers = knockQueues.get(to) || [];
            const isNewKnocker = !knockers.includes(connection.id);
            if (isNewKnocker) knockers.push(connection.id);
            knockQueues.set(to, knockers);
            send(socket, { type: "queued", to, position: knockers.indexOf(connection.id) + 1 });
            sendKnocks(to);
            if (isNewKnocker) {
              const sender = peers.get(connection.id);
              emitActivity("knock", [sender.peer, target.peer]);
            }
            break;
          }
          case "unknock": {
            const to = typeof message.to === "string" ? message.to : "";
            const knockers = knockQueues.get(to);
            if (knockers?.includes(connection.id)) {
              knockers.splice(knockers.indexOf(connection.id), 1);
              notifyKnockQueue(to);
            }
            break;
          }
          case "talking": {
            const target = typeof message.with === "string" ? peers.get(message.with) : null;
            const sender = peers.get(connection.id);
            if (target && sender.peer.status === "busy" && target.peer.status === "busy") {
              emitActivity("talking", [sender.peer, target.peer]);
            }
            break;
          }
          case "signal": {
            let serializedData;
            try {
              serializedData = JSON.stringify(message.data);
            } catch {
              send(socket, { type: "error", message: "signal data must be JSON serializable" });
              break;
            }
            if (serializedData === undefined) {
              send(socket, { type: "error", message: "signal data must be JSON serializable" });
              break;
            }
            if (Buffer.byteLength(serializedData, "utf8") > MAX_SIGNAL_BYTES) {
              send(socket, { type: "error", message: "signal data exceeds 64KB" });
              break;
            }
            const target = typeof message.to === "string" ? peers.get(message.to) : null;
            if (!target || target.socket.readyState !== WebSocket.OPEN) {
              send(socket, {
                type: "signal-error",
                to: typeof message.to === "string" ? message.to : "",
                reason: "offline",
              });
              break;
            }
            send(target.socket, { type: "signal", from: connection.id, data: message.data });
            break;
          }
          default:
            send(socket, { type: "error", message: "unknown message type" });
        }
      } catch (error) {
        send(socket, {
          type: "error",
          message: error instanceof Error ? error.message : "invalid message",
        });
      }
    });

    socket.on("close", () => {
      connections.delete(socket);
      if (!connection.id) return;
      const entry = peers.get(connection.id);
      if (!entry) return;

      removeMatchQueue(connection.id);
      for (const knockerId of knockQueues.get(connection.id) || []) {
        const knocker = peers.get(knockerId);
        if (knocker) send(knocker.socket, { type: "queue-closed", to: connection.id });
      }
      knockQueues.delete(connection.id);

      for (const [targetId, knockers] of knockQueues) {
        const remaining = knockers.filter((id) => id !== connection.id);
        if (remaining.length === knockers.length) continue;
        knockQueues.set(targetId, remaining);
        notifyKnockQueue(targetId);
      }

      peers.delete(connection.id);
      lastPartner.delete(connection.id);
      broadcast({ type: "leave", id: connection.id });
      emitActivity("leave", [entry.peer]);
      console.log(`[worldchat] leave ${JSON.stringify(entry.peer.name)}`);
    });
  });

  const heartbeat = setInterval(() => {
    for (const socket of wss.clients) {
      if (socket.isAlive === false) {
        socket.terminate();
        continue;
      }
      socket.isAlive = false;
      try {
        socket.ping();
      } catch {
        socket.terminate();
      }
    }
  }, 20_000);
  heartbeat.unref();

  server.listen(port);

  async function close() {
    clearInterval(heartbeat);
    for (const socket of wss.clients) socket.terminate();
    const httpClosed = new Promise((resolve) => {
      if (!server.listening) {
        resolve();
        return;
      }
      server.close(resolve);
    });
    const websocketsClosed = new Promise((resolve) => {
      wss.close(resolve);
    });
    await Promise.all([httpClosed, websocketsClosed]);
  }

  return { server, wss, close };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  createServer();
}
