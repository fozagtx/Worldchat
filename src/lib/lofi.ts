const BPM = 76;
const BEAT_SECONDS = 60 / BPM;
const SWING = 0.58;
const PROGRESSION = [
  [53, 57, 60, 64],
  [52, 55, 59, 62],
  [50, 53, 57, 60],
  [48, 52, 55, 59],
];

export interface LofiDebugState {
  running: boolean;
  state: AudioContextState | null;
  scheduledBeats: number;
  scheduledNodes: number;
  ducked: boolean;
  masterGain: number | null;
}

declare global {
  interface Window {
    __lofiState?: LofiDebugState;
  }
}

interface AudioEngine {
  filter: BiquadFilterNode;
  master: GainNode;
  noise: AudioBuffer;
}

let context: AudioContext | null = null;
let engine: AudioEngine | null = null;
let scheduler: number | null = null;
let suspendTimer: number | null = null;
let nextBeatTime = 0;
let beatIndex = 0;
let ducked = false;
let transition = 0;
let scheduledBeats = 0;
let scheduledNodes = 0;

function publishDebug() {
  if (typeof window === "undefined") return;
  window.__lofiState = {
    running: context?.state === "running",
    state: context?.state ?? null,
    scheduledBeats,
    scheduledNodes,
    ducked,
    masterGain: engine?.master.gain.value ?? null,
  };
}

function noiseBuffer(audioContext: AudioContext, seconds: number, pink = false) {
  const buffer = audioContext.createBuffer(1, Math.floor(audioContext.sampleRate * seconds), audioContext.sampleRate);
  const data = buffer.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    if (pink) {
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      b3 = 0.8665 * b3 + white * 0.3104856;
      b4 = 0.55 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.016898;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    } else {
      data[i] = white;
    }
  }
  return buffer;
}

function createEngine() {
  if (context && engine) return;
  context = new AudioContext();
  const filter = context.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 1400;
  filter.Q.value = 0.7;

  const master = context.createGain();
  master.gain.value = 0;

  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -24;
  compressor.knee.value = 18;
  compressor.ratio.value = 3;
  compressor.attack.value = 0.006;
  compressor.release.value = 0.22;

  filter.connect(master).connect(compressor).connect(context.destination);
  engine = { filter, master, noise: noiseBuffer(context, 1) };

  const wow = context.createOscillator();
  const wowDepth = context.createGain();
  wow.frequency.value = 0.3;
  wowDepth.gain.value = 6;
  wow.connect(wowDepth).connect(filter.detune);
  wow.start();

  const crackle = context.createBufferSource();
  const crackleFilter = context.createBiquadFilter();
  const crackleGain = context.createGain();
  crackle.buffer = noiseBuffer(context, 4, true);
  crackle.loop = true;
  crackleFilter.type = "lowpass";
  crackleFilter.frequency.value = 2200;
  crackleGain.gain.value = 0.012;
  crackle.connect(crackleFilter).connect(crackleGain).connect(master);
  crackle.start();

  context.addEventListener("statechange", publishDebug);
  publishDebug();
}

function scheduleChord(time: number) {
  if (!context || !engine) return;
  const notes = PROGRESSION[Math.floor(beatIndex / 4) % PROGRESSION.length];
  const releaseAt = time + BEAT_SECONDS * 4 - 0.2;
  const endAt = releaseAt + 1.2;
  for (const midi of notes) {
    const frequency = 440 * 2 ** ((midi - 69) / 12);
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0.0001, time);
    envelope.gain.linearRampToValueAtTime(0.032, time + 0.08);
    envelope.gain.setValueAtTime(0.032, releaseAt);
    envelope.gain.exponentialRampToValueAtTime(0.0001, endAt);
    envelope.connect(engine.filter);

    const triangle = context.createOscillator();
    const sine = context.createOscillator();
    triangle.type = "triangle";
    sine.type = "sine";
    triangle.frequency.setValueAtTime(frequency, time);
    sine.frequency.setValueAtTime(frequency, time);
    triangle.detune.setValueAtTime(-3, time);
    sine.detune.setValueAtTime(3, time);
    triangle.connect(envelope);
    sine.connect(envelope);

    const tremolo = context.createOscillator();
    const tremoloDepth = context.createGain();
    tremolo.frequency.value = 4.2;
    tremoloDepth.gain.value = 0.004;
    tremolo.connect(tremoloDepth).connect(envelope.gain);

    triangle.start(time);
    sine.start(time);
    tremolo.start(time);
    triangle.stop(endAt + 0.02);
    sine.stop(endAt + 0.02);
    tremolo.stop(endAt + 0.02);
    scheduledNodes += 6;
  }
}

function scheduleKick(time: number, ghost = false) {
  if (!context || !engine) return;
  const oscillator = context.createOscillator();
  const envelope = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(120, time);
  oscillator.frequency.exponentialRampToValueAtTime(45, time + 0.14);
  envelope.gain.setValueAtTime(0.0001, time);
  envelope.gain.linearRampToValueAtTime(ghost ? 0.14 : 0.62, time + 0.004);
  envelope.gain.exponentialRampToValueAtTime(0.0001, time + 0.24);
  oscillator.connect(envelope).connect(engine.filter);
  oscillator.start(time);
  oscillator.stop(time + 0.25);
  scheduledNodes += 2;
}

function scheduleNoiseHit(time: number, duration: number, peak: number, type: BiquadFilterType, frequency: number) {
  if (!context || !engine) return;
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const envelope = context.createGain();
  source.buffer = engine.noise;
  filter.type = type;
  filter.frequency.value = frequency;
  filter.Q.value = type === "bandpass" ? 0.8 : 0.7;
  envelope.gain.setValueAtTime(0.0001, time);
  envelope.gain.linearRampToValueAtTime(peak, time + 0.003);
  envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
  source.connect(filter).connect(envelope).connect(engine.filter);
  source.start(time, 0, duration);
  source.stop(time + duration + 0.01);
  scheduledNodes += 3;
}

function scheduleBeat(time: number, index: number) {
  const beatInBar = index % 4;
  if (beatInBar === 0) scheduleChord(time);
  if (beatInBar === 0 || beatInBar === 2) scheduleKick(time);
  if (beatInBar === 2) scheduleKick(time + BEAT_SECONDS * SWING, true);
  if (beatInBar === 1 || beatInBar === 3) scheduleNoiseHit(time, 0.18, 0.1, "bandpass", 1700);
  scheduleNoiseHit(time, 0.045, 0.014, "highpass", 7200);
  scheduleNoiseHit(time + BEAT_SECONDS * SWING, 0.045, 0.014, "highpass", 7200);
  if (Math.random() < 0.24) scheduleNoiseHit(time + Math.random() * BEAT_SECONDS, 0.018, 0.012, "highpass", 3600);
  scheduledBeats += 1;
}

function scheduleAhead() {
  if (!context || !engine || context.state !== "running") return;
  while (nextBeatTime < context.currentTime + 0.1) {
    scheduleBeat(nextBeatTime, beatIndex);
    nextBeatTime += BEAT_SECONDS;
    beatIndex += 1;
  }
  publishDebug();
}

export async function startLofi() {
  try {
    createEngine();
    if (!context || !engine) return;
    if (suspendTimer !== null) {
      window.clearTimeout(suspendTimer);
      suspendTimer = null;
    }
    const token = ++transition;
    const audioContext = context;
    const audioEngine = engine;
    await audioContext.resume();
    if (token !== transition || audioContext.state !== "running") {
      publishDebug();
      return;
    }
    const now = audioContext.currentTime;
    audioEngine.master.gain.cancelScheduledValues(now);
    audioEngine.master.gain.setValueAtTime(audioEngine.master.gain.value, now);
    audioEngine.master.gain.linearRampToValueAtTime(ducked ? 0.05 : 0.18, now + 0.25);
    if (scheduler === null) {
      beatIndex = 0;
      nextBeatTime = now + 0.05;
      scheduler = window.setInterval(scheduleAhead, 25);
    }
    publishDebug();
  } catch {
    publishDebug();
  }
}

export function stopLofi() {
  if (!context || !engine) {
    publishDebug();
    return;
  }
  if (scheduler !== null) {
    window.clearInterval(scheduler);
    scheduler = null;
  }
  const token = ++transition;
  const now = context.currentTime;
  engine.master.gain.cancelScheduledValues(now);
  engine.master.gain.setValueAtTime(engine.master.gain.value, now);
  engine.master.gain.linearRampToValueAtTime(0, now + 0.6);
  if (suspendTimer !== null) window.clearTimeout(suspendTimer);
  suspendTimer = window.setTimeout(() => {
    if (token !== transition || !context) return;
    suspendTimer = null;
    void context.suspend().then(publishDebug).catch(publishDebug);
  }, 620);
  publishDebug();
}

export function setLofiDuck(on: boolean) {
  ducked = on;
  if (context?.state === "running" && engine) {
    const now = context.currentTime;
    engine.master.gain.cancelScheduledValues(now);
    engine.master.gain.setValueAtTime(engine.master.gain.value, now);
    engine.master.gain.linearRampToValueAtTime(on ? 0.05 : 0.18, now + 0.25);
  }
  publishDebug();
}

publishDebug();
