import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import WebSocket from "ws";
import { createServer } from "./index.js";

let app;
let baseUrl;
let socketUrl;

async function startTestServer(options = {}) {
  const testApp = createServer({ ...options, port: 0 });
  if (!testApp.server.listening) {
    await new Promise((resolve, reject) => {
      testApp.server.once("listening", resolve);
      testApp.server.once("error", reject);
    });
  }
  const address = testApp.server.address();
  return {
    app: testApp,
    baseUrl: `http://127.0.0.1:${address.port}`,
    socketUrl: `ws://127.0.0.1:${address.port}/ws`,
  };
}

before(async () => {
  const server = await startTestServer();
  app = server.app;
  baseUrl = server.baseUrl;
  socketUrl = server.socketUrl;
});

after(async () => {
  await app.close();
});

function connect(t, url = socketUrl) {
  const socket = new WebSocket(url);
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
  assert.equal(secondWelcome.peers[0].with, null);
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

test("new profile fields are normalized and safely defaulted", async (t) => {
  const first = connect(t);
  const firstWelcome = await sayHello(first, profile({
    name: "First",
    gender: "f",
    seeking: "m",
    interests: [" Music\u0000 ", "music", " Games ", "", "a".repeat(21), 42, "Art", "Travel", "Dance", "Coffee"],
    avatar: "face-1",
    cc: "us",
  }));

  const second = connect(t);
  const secondWelcome = await sayHello(second, profile({
    name: "Second",
    gender: "invalid",
    seeking: "x",
    interests: "music",
    avatar: "Not-allowed",
    cc: "USA",
  }));
  const firstPeer = secondWelcome.peers.find((peer) => peer.id === firstWelcome.id);
  assert.ok(firstPeer);
  assert.equal(firstPeer.gender, "f");
  assert.equal(firstPeer.seeking, "m");
  assert.deepEqual(firstPeer.interests, ["music", "games", "art", "travel", "dance"]);
  assert.equal(firstPeer.avatar, "face-1");
  assert.equal(firstPeer.cc, "US");

  const third = connect(t);
  const thirdWelcome = await sayHello(third);
  const secondPeer = thirdWelcome.peers.find((peer) => peer.id === secondWelcome.id);
  assert.ok(secondPeer);
  assert.equal(secondPeer.gender, "x");
  assert.equal(secondPeer.seeking, "any");
  assert.deepEqual(secondPeer.interests, []);
  assert.equal(secondPeer.avatar, secondPeer.id.slice(0, 8));
  assert.equal(secondPeer.cc, "");
});

test("match pairs compatible peers with shared call details and busy status", async (t) => {
  const first = connect(t);
  const second = connect(t);
  const firstWelcome = await sayHello(first, profile({
    name: "A",
    gender: "m",
    seeking: "f",
    interests: ["music"],
  }));
  const secondWelcome = await sayHello(second, profile({
    name: "B",
    gender: "f",
    seeking: "m",
    interests: ["music"],
  }));

  first.send({ type: "match" });
  const firstMatchedPromise = first.waitFor("matched");
  const secondMatchedPromise = second.waitFor("matched");
  second.send({ type: "match" });
  const [firstMatched, secondMatched] = await Promise.all([firstMatchedPromise, secondMatchedPromise]);
  assert.equal(firstMatched.peer.id, secondWelcome.id);
  assert.equal(secondMatched.peer.id, firstWelcome.id);
  assert.equal(firstMatched.callId, secondMatched.callId);
  assert.equal(firstMatched.role, "offer");
  assert.equal(secondMatched.role, "answer");
  assert.deepEqual(firstMatched.shared, ["music"]);
  assert.equal(firstMatched.peer.status, "busy");
  assert.equal(secondMatched.peer.status, "busy");
  assert.equal(firstMatched.peer.with, firstWelcome.id);
  assert.equal(secondMatched.peer.with, secondWelcome.id);
  const firstUpdate = await first.waitFor((message) => message.type === "update" && message.peer.id === firstWelcome.id && message.peer.status === "busy");
  const secondUpdate = await second.waitFor((message) => message.type === "update" && message.peer.id === secondWelcome.id && message.peer.status === "busy");
  assert.equal(firstUpdate.peer.with, secondWelcome.id);
  assert.equal(secondUpdate.peer.with, firstWelcome.id);
});

test("matching skips incompatible genders and pairs when a compatible peer joins", async (t) => {
  const first = connect(t);
  const second = connect(t);
  const firstWelcome = await sayHello(first, profile({ name: "M1", gender: "m", seeking: "f" }));
  await sayHello(second, profile({ name: "M2", gender: "m", seeking: "f" }));
  first.send({ type: "match" });
  second.send({ type: "match" });
  await assert.rejects(first.waitFor("matched", 100), /timed out/);
  await assert.rejects(second.waitFor("matched", 100), /timed out/);

  const woman = connect(t);
  const womanWelcome = await sayHello(woman, profile({ name: "F", gender: "f", seeking: "any" }));
  const firstMatchedPromise = first.waitFor("matched");
  const womanMatchedPromise = woman.waitFor("matched");
  woman.send({ type: "match" });
  const [firstMatched, womanMatched] = await Promise.all([firstMatchedPromise, womanMatchedPromise]);
  assert.equal(firstMatched.peer.id, womanWelcome.id);
  assert.equal(womanMatched.peer.id, firstWelcome.id);
  await assert.rejects(second.waitFor("matched", 100), /timed out/);
});

test("matching prefers the compatible peer with the most shared interests", async (t) => {
  const first = connect(t);
  const second = connect(t);
  const firstWelcome = await sayHello(first, profile({
    name: "Music",
    gender: "m",
    seeking: "f",
    interests: ["music"],
  }));
  await sayHello(second, profile({
    name: "Games",
    gender: "m",
    seeking: "f",
    interests: ["games"],
  }));
  first.send({ type: "match" });
  second.send({ type: "match" });
  await assert.rejects(first.waitFor("matched", 100), /timed out/);

  const third = connect(t);
  const thirdWelcome = await sayHello(third, profile({
    name: "Music match",
    gender: "f",
    seeking: "m",
    interests: ["music"],
  }));
  const firstMatchedPromise = first.waitFor("matched");
  const thirdMatchedPromise = third.waitFor("matched");
  third.send({ type: "match" });
  const [firstMatched, thirdMatched] = await Promise.all([firstMatchedPromise, thirdMatchedPromise]);
  assert.equal(firstMatched.peer.id, thirdWelcome.id);
  assert.equal(thirdMatched.peer.id, firstWelcome.id);
  assert.deepEqual(firstMatched.shared, ["music"]);
  await assert.rejects(second.waitFor("matched", 100), /timed out/);
});

test("recent match partners are skipped until the 30-second cooldown expires", async (t) => {
  let time = 1_000;
  const timedServer = await startTestServer({ now: () => time });
  t.after(() => timedServer.app.close());
  const first = connect(t, timedServer.socketUrl);
  const second = connect(t, timedServer.socketUrl);
  await sayHello(first, profile({ gender: "m", seeking: "f" }));
  await sayHello(second, profile({ gender: "f", seeking: "m" }));

  const initialMatch = first.waitFor("matched");
  const otherInitialMatch = second.waitFor("matched");
  first.send({ type: "match" });
  second.send({ type: "match" });
  const [firstInitial, secondInitial] = await Promise.all([initialMatch, otherInitialMatch]);
  assert.equal(firstInitial.callId, secondInitial.callId);

  first.send({ type: "unmatch" });
  second.send({ type: "unmatch" });
  await first.waitFor((message) => message.type === "update" && message.peer.status === "available");
  await second.waitFor((message) => message.type === "update" && message.peer.status === "available");
  first.send({ type: "match" });
  second.send({ type: "match" });
  await assert.rejects(first.waitFor("matched", 100), /timed out/);
  await assert.rejects(second.waitFor("matched", 100), /timed out/);

  time += 30_000;
  const afterCooldown = first.waitFor("matched");
  const otherAfterCooldown = second.waitFor("matched");
  first.send({ type: "match" });
  const [firstMatched, secondMatched] = await Promise.all([afterCooldown, otherAfterCooldown]);
  assert.equal(firstMatched.callId, secondMatched.callId);
});

test("unmatch removes a peer from the queue and restores available status", async (t) => {
  const first = connect(t);
  const second = connect(t);
  await sayHello(first);
  await sayHello(second);

  first.send({ type: "match" });
  await first.waitFor((message) => message.type === "update" && message.peer.status === "matching");
  first.send({ type: "unmatch" });
  await first.waitFor((message) => message.type === "update" && message.peer.status === "available");
  second.send({ type: "match" });
  await assert.rejects(second.waitFor("matched", 100), /timed out/);

  const firstMatched = first.waitFor("matched");
  const secondMatched = second.waitFor("matched");
  first.send({ type: "match" });
  const [firstResult, secondResult] = await Promise.all([firstMatched, secondMatched]);
  assert.equal(firstResult.callId, secondResult.callId);
});

test("talking sets reciprocal peer relationships and unmatch clears both", async (t) => {
  const first = connect(t);
  const second = connect(t);
  const firstWelcome = await sayHello(first);
  const secondWelcome = await sayHello(second);
  first.send({ type: "status", status: "busy" });
  second.send({ type: "status", status: "busy" });
  await first.waitFor((message) => message.type === "update" && message.peer.id === firstWelcome.id && message.peer.status === "busy");
  await second.waitFor((message) => message.type === "update" && message.peer.id === secondWelcome.id && message.peer.status === "busy");

  const firstLinked = first.waitFor((message) => message.type === "update" && message.peer.id === firstWelcome.id && message.peer.with === secondWelcome.id);
  const secondLinked = second.waitFor((message) => message.type === "update" && message.peer.id === secondWelcome.id && message.peer.with === firstWelcome.id);
  first.send({ type: "talking", with: secondWelcome.id });
  await Promise.all([firstLinked, secondLinked]);

  const firstCleared = first.waitFor((message) => message.type === "update" && message.peer.id === firstWelcome.id && message.peer.status === "available" && message.peer.with === null);
  const secondCleared = second.waitFor((message) => message.type === "update" && message.peer.id === secondWelcome.id && message.peer.with === null);
  first.send({ type: "unmatch" });
  assert.equal((await firstCleared).peer.with, null);
  assert.equal((await secondCleared).peer.with, null);
});

test("status available clears both sides of a talking relationship", async (t) => {
  const first = connect(t);
  const second = connect(t);
  const firstWelcome = await sayHello(first);
  const secondWelcome = await sayHello(second);
  first.send({ type: "status", status: "busy" });
  second.send({ type: "status", status: "busy" });
  await first.waitFor((message) => message.type === "update" && message.peer.id === firstWelcome.id && message.peer.status === "busy");
  await second.waitFor((message) => message.type === "update" && message.peer.id === secondWelcome.id && message.peer.status === "busy");

  const firstLinked = first.waitFor((message) => message.type === "update" && message.peer.id === firstWelcome.id && message.peer.with === secondWelcome.id);
  const secondLinked = second.waitFor((message) => message.type === "update" && message.peer.id === secondWelcome.id && message.peer.with === firstWelcome.id);
  first.send({ type: "talking", with: secondWelcome.id });
  await Promise.all([firstLinked, secondLinked]);

  const firstCleared = first.waitFor((message) => message.type === "update" && message.peer.id === firstWelcome.id && message.peer.status === "available" && message.peer.with === null);
  const secondCleared = second.waitFor((message) => message.type === "update" && message.peer.id === secondWelcome.id && message.peer.with === null);
  first.send({ type: "status", status: "available" });
  assert.equal((await firstCleared).peer.with, null);
  assert.equal((await secondCleared).peer.with, null);
});

test("disconnect clears the remaining peer's call relationship", async (t) => {
  const first = connect(t);
  const second = connect(t);
  const firstWelcome = await sayHello(first);
  const secondWelcome = await sayHello(second);
  first.send({ type: "status", status: "busy" });
  second.send({ type: "status", status: "busy" });
  await first.waitFor((message) => message.type === "update" && message.peer.id === firstWelcome.id && message.peer.status === "busy");
  await second.waitFor((message) => message.type === "update" && message.peer.id === secondWelcome.id && message.peer.status === "busy");

  const firstLinked = first.waitFor((message) => message.type === "update" && message.peer.id === firstWelcome.id && message.peer.with === secondWelcome.id);
  const secondLinked = second.waitFor((message) => message.type === "update" && message.peer.id === secondWelcome.id && message.peer.with === firstWelcome.id);
  first.send({ type: "talking", with: secondWelcome.id });
  await Promise.all([firstLinked, secondLinked]);

  const secondCleared = second.waitFor((message) => message.type === "update" && message.peer.id === secondWelcome.id && message.peer.with === null);
  const firstLeft = second.waitFor((message) => message.type === "leave" && message.id === firstWelcome.id);
  await first.close();
  assert.equal((await secondCleared).peer.with, null);
  assert.equal((await firstLeft).id, firstWelcome.id);
});

test("knocks reject available peers and queue knockers in FIFO order", async (t) => {
  const target = connect(t);
  const first = connect(t);
  const second = connect(t);
  const targetWelcome = await sayHello(target, profile({ name: "Target" }));
  await sayHello(first, profile({ name: "First knocker" }));
  await sayHello(second, profile({ name: "Second knocker" }));

  first.send({ type: "knock", to: targetWelcome.id });
  assert.deepEqual(await first.waitFor("knock-error"), {
    type: "knock-error",
    to: targetWelcome.id,
    reason: "available",
  });

  target.send({ type: "status", status: "busy" });
  await target.waitFor((message) => message.type === "update" && message.peer.status === "busy");
  first.send({ type: "knock", to: targetWelcome.id });
  const firstQueued = await first.waitFor("queued");
  const firstKnocks = await target.waitFor((message) => message.type === "knocks" && message.count === 1);
  second.send({ type: "knock", to: targetWelcome.id });
  const secondQueued = await second.waitFor("queued");
  const secondKnocks = await target.waitFor((message) => message.type === "knocks" && message.count === 2);
  assert.deepEqual(firstQueued, { type: "queued", to: targetWelcome.id, position: 1 });
  assert.deepEqual(secondQueued, { type: "queued", to: targetWelcome.id, position: 2 });
  assert.equal(firstKnocks.count, 1);
  assert.deepEqual(secondKnocks.names, ["First knocker", "Second knocker"]);
});

test("available targets hand off to the first knocker and reindex the queue", async (t) => {
  const target = connect(t);
  const first = connect(t);
  const second = connect(t);
  const targetWelcome = await sayHello(target);
  await sayHello(first);
  await sayHello(second);
  target.send({ type: "status", status: "busy" });
  await target.waitFor((message) => message.type === "update" && message.peer.status === "busy");
  first.send({ type: "knock", to: targetWelcome.id });
  second.send({ type: "knock", to: targetWelcome.id });
  await first.waitFor("queued");
  await second.waitFor("queued");

  const yourTurn = first.waitFor("your-turn");
  const secondPosition = second.waitFor((message) => message.type === "queued" && message.position === 1);
  const remainingKnocks = target.waitFor((message) => message.type === "knocks" && message.count === 1);
  target.send({ type: "status", status: "available" });
  assert.equal((await yourTurn).peer.id, targetWelcome.id);
  assert.equal((await secondPosition).position, 1);
  assert.equal((await remainingKnocks).count, 1);
});

test("busy knockers stay queued while the first available knocker gets a turn", async (t) => {
  const target = connect(t);
  const busy = connect(t);
  const available = connect(t);
  const targetWelcome = await sayHello(target);
  await sayHello(busy);
  await sayHello(available);
  busy.send({ type: "status", status: "busy" });
  await busy.waitFor((message) => message.type === "update" && message.peer.status === "busy");
  target.send({ type: "status", status: "busy" });
  await target.waitFor((message) => message.type === "update" && message.peer.status === "busy");
  busy.send({ type: "knock", to: targetWelcome.id });
  available.send({ type: "knock", to: targetWelcome.id });
  await busy.waitFor("queued");
  await available.waitFor("queued");

  const yourTurn = available.waitFor("your-turn");
  const busyPosition = busy.waitFor((message) => message.type === "queued" && message.position === 1);
  target.send({ type: "status", status: "available" });
  assert.equal((await yourTurn).peer.id, targetWelcome.id);
  assert.equal((await busyPosition).position, 1);
});

test("a matching knocker leaves the match queue when handed a turn", async (t) => {
  const target = connect(t);
  const knocker = connect(t);
  const targetWelcome = await sayHello(target);
  const knockerWelcome = await sayHello(knocker, profile({ gender: "m", seeking: "f" }));
  target.send({ type: "status", status: "busy" });
  await target.waitFor((message) => message.type === "update" && message.peer.status === "busy");
  knocker.send({ type: "match" });
  await knocker.waitFor((message) => message.type === "update" && message.peer.id === knockerWelcome.id && message.peer.status === "matching");
  knocker.send({ type: "knock", to: targetWelcome.id });
  await knocker.waitFor("queued");

  const availableUpdate = knocker.waitFor((message) => message.type === "update" && message.peer.id === knockerWelcome.id && message.peer.status === "available");
  const yourTurn = knocker.waitFor("your-turn");
  target.send({ type: "status", status: "available" });
  assert.equal((await availableUpdate).peer.status, "available");
  assert.equal((await yourTurn).peer.id, targetWelcome.id);
});

test("unknocking and knocker disconnects update remaining positions", async (t) => {
  const target = connect(t);
  const first = connect(t);
  const second = connect(t);
  const targetWelcome = await sayHello(target);
  await sayHello(first);
  await sayHello(second);
  target.send({ type: "status", status: "busy" });
  await target.waitFor((message) => message.type === "update" && message.peer.status === "busy");
  first.send({ type: "knock", to: targetWelcome.id });
  second.send({ type: "knock", to: targetWelcome.id });
  await first.waitFor("queued");
  await second.waitFor("queued");

  const afterUnknock = second.waitFor((message) => message.type === "queued" && message.position === 1);
  const knocksAfterUnknock = target.waitFor((message) => message.type === "knocks" && message.count === 1);
  first.send({ type: "unknock", to: targetWelcome.id });
  assert.equal((await afterUnknock).position, 1);
  assert.equal((await knocksAfterUnknock).count, 1);

  const firstAgain = first.waitFor("queued");
  first.send({ type: "knock", to: targetWelcome.id });
  await firstAgain;
  const afterDisconnect = second.waitFor((message) => message.type === "queued" && message.position === 1);
  const knocksAfterDisconnect = target.waitFor((message) => message.type === "knocks" && message.count === 1);
  await first.close();
  assert.equal((await afterDisconnect).position, 1);
  assert.equal((await knocksAfterDisconnect).count, 1);
});

test("disconnecting a target closes its knock queue", async (t) => {
  const target = connect(t);
  const first = connect(t);
  const second = connect(t);
  const targetWelcome = await sayHello(target);
  await sayHello(first);
  await sayHello(second);
  target.send({ type: "status", status: "busy" });
  await target.waitFor((message) => message.type === "update" && message.peer.status === "busy");
  first.send({ type: "knock", to: targetWelcome.id });
  second.send({ type: "knock", to: targetWelcome.id });
  await first.waitFor("queued");
  await second.waitFor("queued");

  const firstClosed = first.waitFor("queue-closed");
  const secondClosed = second.waitFor("queue-closed");
  await target.close();
  assert.deepEqual(await firstClosed, { type: "queue-closed", to: targetWelcome.id });
  assert.deepEqual(await secondClosed, { type: "queue-closed", to: targetWelcome.id });
});

test("activity history is included in welcome and join events are broadcast", async (t) => {
  const testServer = await startTestServer();
  t.after(() => testServer.app.close());
  const first = connect(t, testServer.socketUrl);
  const firstWelcome = await sayHello(first, profile({ name: "First", cc: "ca" }));
  assert.deepEqual(firstWelcome.activity, []);
  const firstJoin = await first.waitFor((message) => message.type === "activity" && message.event.kind === "join");
  assert.deepEqual(firstJoin.event.names, ["First"]);
  assert.equal(firstJoin.event.cc, "CA");
  assert.equal(firstJoin.event.city, "Oslo");

  const second = connect(t, testServer.socketUrl);
  const secondWelcome = await sayHello(second, profile({ name: "Second" }));
  assert.equal(secondWelcome.activity.length, 1);
  assert.equal(secondWelcome.activity[0].id, firstJoin.event.id);
  const secondJoin = await first.waitFor((message) => message.type === "activity" && message.event.kind === "join");
  assert.deepEqual(secondJoin.event.names, ["Second"]);
});

test("talking activity is emitted once per pair within ten seconds", async (t) => {
  const first = connect(t);
  const second = connect(t);
  const firstWelcome = await sayHello(first);
  const secondWelcome = await sayHello(second);
  first.send({ type: "status", status: "busy" });
  second.send({ type: "status", status: "busy" });
  await first.waitFor((message) => message.type === "update" && message.peer.id === firstWelcome.id && message.peer.status === "busy");
  await second.waitFor((message) => message.type === "update" && message.peer.id === secondWelcome.id && message.peer.status === "busy");

  const firstTalking = first.waitFor((message) => message.type === "activity" && message.event.kind === "talking");
  const secondTalking = second.waitFor((message) => message.type === "activity" && message.event.kind === "talking");
  first.send({ type: "talking", with: secondWelcome.id });
  const [firstEvent, secondEvent] = await Promise.all([firstTalking, secondTalking]);
  assert.equal(firstEvent.event.id, secondEvent.event.id);
  assert.deepEqual(firstEvent.event.names, ["Traveler", "Traveler"]);

  first.send({ type: "talking", with: secondWelcome.id });
  await assert.rejects(first.waitFor((message) => message.type === "activity" && message.event.kind === "talking", 100), /timed out/);
  await assert.rejects(second.waitFor((message) => message.type === "activity" && message.event.kind === "talking", 100), /timed out/);
});

test("broadcasts do not reach sockets that have not said hello", async (t) => {
  const waiting = connect(t);
  await waiting.opened;
  waiting.send({ type: "status", status: "busy" });
  assert.deepEqual(await waiting.waitFor("error"), { type: "error", message: "say hello first" });

  const peer = connect(t);
  await sayHello(peer);
  await assert.rejects(
    waiting.waitFor((message) => message.type === "join" || message.type === "activity", 100),
    /timed out/,
  );
});
