"use client";
/**
 * STOP-MOTION TOOLKIT
 *
 * Real stop-motion films are shot "on twos": 12 drawings per second, each
 * held for two frames. Here that means:
 *  - one shared 12fps clock (`useFrame`) that drives the clay "boil"
 *    (the handmade wobble), film grain and candle flicker
 *  - `onTwos(seconds)` turns any GSAP tween into stepped 12fps motion
 *  - everything stops when the user prefers reduced motion
 */
import { createContext, useContext, useSyncExternalStore } from "react";

export const FPS = 12;

/** GSAP ease that moves in 12fps steps (no smooth in-betweens). */
export const onTwos = (seconds: number) => `steps(${Math.max(1, Math.round(seconds * FPS))})`;

// ---- one shared 12fps clock for every animated thing on the page ---------
let frame = 0;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  if (!timer) {
    timer = setInterval(() => {
      frame = (frame + 1) % 6000;
      listeners.forEach((l) => l());
    }, 1000 / FPS);
  }
  return () => {
    listeners.delete(cb);
    if (!listeners.size && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

const noop = () => () => {};

/** Current frame number at 12fps (0 forever when motion is reduced). */
export function useFrame(): number {
  const reduced = useReducedMotion();
  return useSyncExternalStore(reduced ? noop : subscribe, () => (reduced ? 0 : frame), () => 0);
}

/** Which of the 3 "boil" variations to show this frame. */
export function useBoil(): number {
  return useFrame() % 3;
}

// ---- reduced motion (system setting, or forced on the /lab page) ---------
export const MotionOverride = createContext<boolean | null>(null);

function subscribeMedia(cb: () => void) {
  const m = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  m?.addEventListener("change", cb);
  return () => m?.removeEventListener("change", cb);
}

export function useReducedMotion(): boolean {
  const forced = useContext(MotionOverride);
  const system = useSyncExternalStore(
    subscribeMedia,
    () => Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches),
    () => false,
  );
  return forced ?? system;
}

/** Tiny deterministic "random" so each frame's jitter is repeatable. */
export function jitter(seed: number, amount: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return (x - Math.floor(x) - 0.5) * 2 * amount;
}
