/**
 * Small color helpers so each café's brand works in BOTH light and dark mode.
 * Owners pick dark-theme colors; we derive a readable light theme from them.
 */
export function parseHex(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("")}`;
}
export function mix(a: string, b: string, t: number): string {
  const pa = parseHex(a);
  const pb = parseHex(b);
  return toHex([0, 1, 2].map((i) => pa[i] * (1 - t) + pb[i] * t) as [number, number, number]);
}
export function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}
/** Darkens `color` until it reaches `ratio` contrast against `bg`. */
export function ensureContrast(color: string, bg: string, ratio: number): string {
  let c = color;
  for (let i = 0; i < 20 && contrast(c, bg) < ratio; i++) c = mix(c, luminance(bg) > 0.5 ? "#000000" : "#ffffff", 0.12);
  return c;
}
export function readableOn(bg: string): string {
  return contrast("#ffffff", bg) >= contrast("#111111", bg) ? "#ffffff" : "#111111";
}
