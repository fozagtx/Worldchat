import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import WebSocket from "ws";
import { createServer } from "./index.js";

let app;
let baseUrl;
let socketUrl;

before(async () => {
  app = createServer({ port: 0 });
  if (!app.server.listening) {
    await new Promise((resolve, reject) => {
      app.server.once("listening", resolve);
      app.server.once("error", reject);
    });
  }
  const address = app.server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
  socketUrl = `ws://127.0.0.1:${address.port}/ws`;
});

after(async () => {
  await app.close();
});

function connect(t) {
  const socket = new WebSocket(socketUrl);
  const messages = [];
  const waiters = [];
  socket.on("error", () => {});
  socket.on("message", (data) => {
    const message = JSON.parse(data.toString());
    const index = waiters.findIndex((waiter) => waiter.matches(message));
    if (index === -1) {
      messages.push(message);
      return;
    }
    const [waiter] = waiters.splice(index, 1);
    clearTimeout(waiter.timer);
    waiter.resolve(message);
  });

  const opened = new Promise((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  const waitFor = (predicate, timeout = 3000) => {
    const matches = typeof predicate === "string"
      ? (message) => message.type === predicate
      : predicate;
    const index = messages.findIndex(matches);
    if (index !== -1) return Promise.resolve(messages.splice(index, 1)[0]);
    return new Promise((resolve, reject) => {
      const waiter = {
        matches,
        resolve,
        timer: setTimeout(() => {
          const waiterIndex = waiters.indexOf(waiter);
          if (waiterIndex !== -1) waiters.splice(waiterIndex, 1);
          reject(new Error("timed out waiting for WebSocket message"));
        }, timeout),
      };
      waiters.push(waiter);
    });
  };
  const send = (message) => socket.send(JSON.stringify(message));
  const close = () => new Promise((resolve) => {
    if (socket.readyState === WebSocket.CLOSED) {
      resolve();
      return;
    }
    socket.once("close", resolve);
    if (socket.readyState === WebSocket.CONNECTING) socket.terminate();
    else socket.close();
  });
  t.after(close);

  return { socket, opened, waitFor, send, close };
}

function profile(overrides = {}) {
  return {
    name: "Traveler",
    color: "#aabbcc",
    city: "Oslo",
    country: "Norway",
    lat: 59.91,
    lng: 10.75,
    tz: "Europe/Oslo",
    ...overrides,
  };
}

async function sayHello(client, value = profile()) {
  await client.opened;
  client.send({ type: "hello", profile: value });
  return client.waitFor("welcome");
}

test("hello welcomes with current peers and broadcasts joins", async (t) => {
  const first = connect(t);
  const firstWelcome = await sayHello(first);
  assert.deepEqual(firstWelcome.peers, []);

  const second = connect(t);
  const secondWelcome = await sayHello(second);
  assert.equal(secondWelcome.peers.length, 1);
  assert.equal(secondWelcome.peers[0].id, firstWelcome.id);
  const join = await first.waitFor((message) => message.type === "join" && message.peer.id === secondWelcome.id);
  assert.equal(join.peer.name, "Traveler");
});

test("hello sanitizes names, defaults invalid colors, and rounds coordinates", async (t) => {
  const client = connect(t);
  const welcome = await sayHello(client, profile({
    name: " \nA\u0000lice\t ",
    color: "brown",
    lat: 12.26,
    lng: -45.24,
  }));
  assert.equal(welcome.id.length > 0, true);

  const second = connect(t);
  await second.opened;
  second.send({ type: "hello", profile: profile({ name: "Observer" }) });
  const observerWelcome = await second.waitFor("welcome");
  const firstPeer = observerWelcome.peers.find((entry) => entry.name === "Alice");
  assert.ok(firstPeer);
  assert.equal(firstPeer.color, "#8a5a3b");
  assert.equal(firstPeer.lat, 12.3);
  assert.equal(firstPeer.lng, -45.2);
});

test("signals reach only the target and offline targets receive signal-error", async (t) => {
  const sender = connect(t);
  const target = connect(t);
  const other = connect(t);
  const senderWelcome = await sayHello(sender);
  const targetWelcome = await sayHello(target);
  await sayHello(other);

  const payload = { description: { type: "offer", sdp: "session" } };
  sender.send({ type: "signal", to: targetWelcome.id, data: payload });
  const received = await target.waitFor("signal");
  assert.equal(received.from, senderWelcome.id);
  assert.deepEqual(received.data, payload);
  await assert.rejects(sender.waitFor("signal", 150), /timed out/);
  await assert.rejects(other.waitFor("signal", 150), /timed out/);

  sender.send({ type: "signal", to: "not-online", data: {} });
  assert.deepEqual(await sender.waitFor("signal-error"), {
    type: "signal-error",
    to: "not-online",
    reason: "offline",
  });

  sender.send({ type: "signal", to: targetWelcome.id, data: { blob: "x".repeat(64 * 1024) } });
  assert.equal((await sender.waitFor("error")).message, "signal data exceeds 64KB");
});

test("status changes are broadcast to the sender and other peers", async (t) => {
  const first = connect(t);
  const second = connect(t);
  const firstWelcome = await sayHello(first);
  await sayHello(second);

  first.send({ type: "status", status: "busy" });
  const firstUpdate = await first.waitFor((message) => message.type === "update" && message.peer.id === firstWelcome.id);
  const secondUpdate = await second.waitFor((message) => message.type === "update" && message.peer.id === firstWelcome.id);
  assert.equal(firstUpdate.peer.status, "busy");
  assert.equal(secondUpdate.peer.status, "busy");
});

test("closing a peer broadcasts leave", async (t) => {
  const first = connect(t);
  const second = connect(t);
  const firstWelcome = await sayHello(first);
  await sayHello(second);
  const leave = second.waitFor((message) => message.type === "leave" && message.id === firstWelcome.id);
  await first.close();
  assert.deepEqual(await leave, { type: "leave", id: firstWelcome.id });
});

test("messages before hello receive an error and invalid hello keeps the socket open", async (t) => {
  const client = connect(t);
  await client.opened;
  client.send({ type: "status", status: "busy" });
  assert.deepEqual(await client.waitFor("error"), { type: "error", message: "say hello first" });

  client.send({ type: "hello", profile: profile({ name: " \u0000 " }) });
  assert.match((await client.waitFor("error")).message, /name must be 1–24 characters/);
  client.send({ type: "hello", profile: profile() });
  assert.equal((await client.waitFor("welcome")).peers.length, 0);
});

test("healthz reports connected peers", async (t) => {
  const client = connect(t);
  await sayHello(client);
  const response = await fetch(`${baseUrl}/healthz`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, online: 1 });
});
