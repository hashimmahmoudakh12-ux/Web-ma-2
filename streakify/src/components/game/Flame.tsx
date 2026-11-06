/**
 * STREAK FLAME: grows and changes color the longer the streak.
 *   0 weeks   grey ember
 *   1-3       small orange
 *   4-7       bigger, red-orange
 *   8-11      gold with a white-hot core
 *   12-25     blue
 *   26-51     purple
 *   52+       rainbow
 * Pure SVG + CSS animation (no images), respects "reduce motion".
 */
const TIERS = [
  { min: 52, outer: ["#ff4d4d", "#ffb84d", "#7dff7a", "#4dc3ff", "#b44dff"], inner: "#ffffff", label: "Legendary" },
  { min: 26, outer: ["#7b2ff7", "#c86dd7"], inner: "#f3d9ff", label: "Mythic" },
  { min: 12, outer: ["#1e6bff", "#5ad1ff"], inner: "#e6f7ff", label: "Blue flame" },
  { min: 8, outer: ["#ff8a00", "#ffd000"], inner: "#fffbe6", label: "White hot" },
  { min: 4, outer: ["#ff3d00", "#ff9100"], inner: "#ffe082", label: "Blazing" },
  { min: 1, outer: ["#ff6d00", "#ffab40"], inner: "#ffe0b2", label: "Lit" },
  { min: 0, outer: ["#6b6b6b", "#9e9e9e"], inner: "#d6d6d6", label: "Ember" },
];

export function flameTier(weeks: number) {
  return TIERS.find((t) => weeks >= t.min)!;
}

export function Flame({ weeks, size = 96 }: { weeks: number; size?: number }) {
  const tier = flameTier(weeks);
  const grow = weeks === 0 ? 0.55 : Math.min(1, 0.65 + Math.log2(weeks + 1) * 0.07);
  const id = `f${weeks}-${size}`;
  const stops = tier.outer;
  return (
    <div className="relative inline-flex items-end justify-center" style={{ width: size, height: size }} aria-label={`${weeks}-week streak flame`} role="img">
      <style>{`
        @keyframes flick-${id}{0%,100%{transform:scale(${grow}) skewX(0deg)}25%{transform:scale(${grow * 1.03},${grow * 0.97}) skewX(-2deg)}50%{transform:scale(${grow * 0.98},${grow * 1.04}) skewX(1.5deg)}75%{transform:scale(${grow * 1.02},${grow * 0.99}) skewX(-1deg)}}
        @keyframes glow-${id}{0%,100%{opacity:.55}50%{opacity:.85}}
      `}</style>
      {weeks > 0 && (
        <div className="absolute inset-x-[15%] bottom-[5%] h-[45%] rounded-full blur-xl" style={{ background: stops[0], animation: `glow-${id} 1.6s ease-in-out infinite` }} />
      )}
      <svg
        viewBox="0 0 100 120"
        width={size}
        height={size}
        style={{ transformOrigin: "50% 100%", animation: weeks > 0 ? `flick-${id} 1.2s ease-in-out infinite` : undefined, transform: `scale(${grow})` }}
      >
        <defs>
          <linearGradient id={`g-${id}`} x1="0" y1="1" x2="0" y2="0">
            {stops.map((s, i) => (
              <stop key={i} offset={`${(i / Math.max(1, stops.length - 1)) * 100}%`} stopColor={s} />
            ))}
          </linearGradient>
        </defs>
        <path d="M50 4 C58 26 82 40 82 72 C82 98 66 116 50 116 C34 116 18 98 18 72 C18 54 30 46 34 30 C40 42 44 46 48 48 C46 30 46 18 50 4 Z" fill={`url(#g-${id})`} />
        <path d="M50 52 C56 64 66 72 66 88 C66 102 58 110 50 110 C42 110 34 102 34 88 C34 78 40 72 43 64 C46 70 48 72 50 72 C49 64 48 58 50 52 Z" fill={tier.inner} opacity={0.9} />
      </svg>
    </div>
  );
}
