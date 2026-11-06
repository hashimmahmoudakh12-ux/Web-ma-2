"use client";
import confetti from "canvas-confetti";

/** Bursts of confetti in the café's colors. */
export function fireConfetti(colors: string[]) {
  if (typeof window === "undefined") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const base = { colors, disableForReducedMotion: true, zIndex: 100 };
  confetti({ ...base, particleCount: 90, spread: 70, origin: { y: 0.6 }, startVelocity: 45 });
  setTimeout(() => confetti({ ...base, particleCount: 50, angle: 60, spread: 55, origin: { x: 0 } }), 180);
  setTimeout(() => confetti({ ...base, particleCount: 50, angle: 120, spread: 55, origin: { x: 1 } }), 320);
}
