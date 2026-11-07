"use client";
/**
 * Sounds + haptics for the customer app.
 * Sounds are synthesized with the Web Audio API (no audio files to load) and
 * can be muted (remembered on the phone). Haptics use navigator.vibrate,
 * which works on Android; iPhone Safari doesn't let web pages vibrate.
 */
const KEY = "streakify:muted";

export function isMuted(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}
export function setMuted(m: boolean) {
  try {
    localStorage.setItem(KEY, m ? "1" : "0");
  } catch {}
}

let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  if (typeof window === "undefined" || isMuted()) return null;
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx ??= new AC();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = "sine", gain = 0.18) {
  const a = audio();
  if (!a) return;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.value = freq;
  const t = a.currentTime + start;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}

/** Filtered noise burst: the base of clay, pouring and paper sounds. */
function noise(start: number, dur: number, type: BiquadFilterType, freq: number, gain = 0.2, q = 1, sweepTo?: number) {
  const a = audio();
  if (!a) return;
  const len = Math.ceil(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  const t = a.currentTime + start;
  f.frequency.setValueAtTime(freq, t);
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.03, dur / 4));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(a.destination);
  src.start(t);
  src.stop(t + dur + 0.02);
}

export const sounds = {
  /** Soft clay squish (mascot moves) */
  squish() {
    noise(0, 0.16, "lowpass", 900, 0.25, 4, 180);
    tone(140, 0, 0.12, "sine", 0.08);
  },
  /** Coffee pouring from the dallah */
  pour(seconds = 0.9) {
    noise(0, seconds, "bandpass", 1300, 0.12, 3, 700);
    for (let i = 0; i < 5; i++) tone(380 + Math.random() * 200, 0.1 + i * (seconds / 6), 0.07, "sine", 0.03);
  },
  /** Little cup clink */
  clink() {
    tone(2350, 0, 0.35, "sine", 0.1);
    tone(3520, 0.005, 0.25, "sine", 0.06);
  },
  /** Paper cutout landing */
  rustle() {
    noise(0, 0.12, "highpass", 2500, 0.12, 0.7);
    noise(0.07, 0.1, "highpass", 3500, 0.08, 0.7);
  },
  /** Rising major arpeggio */
  levelUp() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * 0.09, 0.35, "triangle"));
    tone(1318.5, 0.38, 0.6, "sine", 0.12);
  },
  /** Bright two-note chime */
  reward() {
    tone(880, 0, 0.25, "sine");
    tone(1320, 0.1, 0.4, "sine");
  },
  /** Short pop */
  badge() {
    tone(660, 0, 0.12, "square", 0.08);
    tone(990, 0.06, 0.2, "triangle");
  },
  /** Soft tick (dallah shaking) */
  tick() {
    tone(1200, 0, 0.05, "square", 0.04);
  },
  tap() {
    tone(500, 0, 0.04, "sine", 0.05);
  },
};

function vibrate(p: number | number[]) {
  try {
    if (!isMuted() && "vibrate" in navigator) navigator.vibrate(p);
  } catch {}
}

export const haptics = {
  tap: () => vibrate(10),
  success: () => vibrate([15, 40, 25]),
  levelUp: () => vibrate([20, 50, 20, 50, 60]),
};
