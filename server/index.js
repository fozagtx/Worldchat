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

  return {
    name,
    color,
    city: cleanText(profile.city ?? "", "city", 48),
    country: cleanText(profile.country ?? "", "country", 48),
    lat: Math.round(profile.lat * 10) / 10,
    lng: Math.round(profile.lng * 10) / 10,
    tz: cleanText(profile.tz ?? "", "tz", 64),
  };
}

function contentTypeFor(filePath) {
  return CONTENT_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

export function createServer({ port = process.env.PORT ? Number(process.env.PORT) : 8787 } = {}) {
  const peers = new Map();
  const connections = new Map();
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });

  const broadcast = (message, exceptSocket = null) => {
    for (const socket of wss.clients) {
      if (socket !== exceptSocket) send(socket, message);
    }
  };

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
            const peer = {
              id: randomUUID(),
              ...profile,
              status: "available",
              joinedAt: new Date().toISOString(),
            };
            connection.id = peer.id;
            peers.set(peer.id, { peer, socket });
            const others = [...peers.values()]
              .filter((entry) => entry.peer.id !== peer.id)
              .map((entry) => entry.peer);
            send(socket, { type: "welcome", id: peer.id, peers: others });
            broadcast({ type: "join", peer }, socket);
            console.log(`[worldchat] join ${JSON.stringify(peer.name)}`);
            break;
          }
          case "update": {
            const current = peers.get(connection.id);
            const profile = sanitizeProfile(message.profile);
            current.peer = { ...current.peer, ...profile };
            broadcast({ type: "update", peer: current.peer });
            break;
          }
          case "status": {
            if (message.status !== "available" && message.status !== "busy") {
              send(socket, { type: "error", message: "status must be available or busy" });
              break;
            }
            const current = peers.get(connection.id);
            current.peer = { ...current.peer, status: message.status };
            broadcast({ type: "update", peer: current.peer });
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
      peers.delete(connection.id);
      broadcast({ type: "leave", id: connection.id });
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
