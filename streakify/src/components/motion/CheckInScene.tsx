"use client";
/**
 * CHECK-IN ANIMATION: a tiny stop-motion film.
 *
 * The clay dallah tilts and pours a finjan (cup) of coffee on a wooden table,
 * the cup fills, steam rises... and the steam forms the streak number.
 * Paper-cutout labels drop in and the dallah cheers.
 *
 *   variant="full"   cinematic version for the customer's phone (~4.5 s):
 *                    fade-in, camera push-in, parallax on tilt, steam wisps
 *   variant="short"  counter-tablet version (under 2 s) so the line keeps moving
 *
 * Everything moves in 12fps steps (see stopmotion.ts). With "reduce motion"
 * the final frame is shown calmly, no movement.
 */
import gsap from "gsap";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { sounds } from "@/components/game/feedback";
import { ClayDefs, DallahArt, type MascotPalette, type Mood } from "./Dallah";
import { onTwos, useBoil, useReducedMotion } from "./stopmotion";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

// Where things sit in the 400 x 300 miniature set
const PIVOT = "202 229.6"; // dallah base, the point it tilts around
const CUP_X = 300;
const TILT = 32; // degrees: spout ends up right over the cup

/** Wedges of the stained-glass half-moon (qamariya) above the window. */
function qamariya(cx: number, cy: number, r: number, colors: string[]) {
  const n = colors.length;
  return colors.map((c, i) => {
    const a0 = Math.PI + (i / n) * Math.PI;
    const a1 = Math.PI + ((i + 1) / n) * Math.PI;
    const p = (a: number) => `${(cx + r * Math.cos(a)).toFixed(1)} ${(cy + r * Math.sin(a)).toFixed(1)}`;
    return <path key={i} d={`M${cx} ${cy} L${p(a0)} A${r} ${r} 0 0 1 ${p(a1)} Z`} fill={c} stroke="#e9dcc2" strokeWidth="1.6" />;
  });
}

/** A torn paper-cutout label. */
function PaperTag({ x, y, w, h, color, text, textColor, rotate, dataKey, size = 13, filter }: {
  x: number; y: number; w: number; h: number; color: string; text: string; textColor: string; rotate: number; dataKey: string; size?: number; filter: string;
}) {
  // jagged "torn" edges
  const pts: string[] = [];
  const steps = 9;
  for (let i = 0; i <= steps; i++) pts.push(`${x + (w * i) / steps},${y + (i % 2 ? 1.5 : -1)}`);
  pts.push(`${x + w + 1.5},${y + h / 2}`);
  for (let i = steps; i >= 0; i--) pts.push(`${x + (w * i) / steps},${y + h + (i % 2 ? -1 : 1.5)}`);
  pts.push(`${x - 1.5},${y + h / 2}`);
  return (
    <g data-k={dataKey} transform={`rotate(${rotate} ${x + w / 2} ${y + h / 2})`} filter={filter}>
      <polygon points={pts.join(" ")} fill={color} />
      <text x={x + w / 2} y={y + h / 2 + size * 0.36} textAnchor="middle" fontSize={size} fontWeight={800} letterSpacing="1.5" fill={textColor} style={{ fontFamily: "ui-rounded, 'SF Pro Rounded', system-ui, sans-serif" }}>
        {text}
      </text>
    </g>
  );
}

export function CheckInScene({
  variant = "full",
  streakWeeks,
  xpGained,
  palette,
  sound = true,
  onDone,
  className = "",
}: {
  variant?: "full" | "short";
  streakWeeks: number;
  xpGained?: number | null;
  palette: MascotPalette;
  sound?: boolean;
  onDone?: () => void;
  className?: string;
}) {
  const id = useId().replace(/:/g, "");
  const root = useRef<HTMLDivElement>(null);
  const [mood, setMood] = useState<Mood>("idle");
  const frame = useBoil();
  const reduced = useReducedMotion();
  const full = variant === "full";
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });

  // ---- the film's timeline ------------------------------------------------
  useIsoLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const ctx = gsap.context(() => {
      const q = gsap.utils.selector(el);
      const disp = q("[data-k=steam-disp]")[0];
      const blur = q("[data-k=steam-blur]")[0];
      const play = (fn: () => void) => () => sound && fn();

      if (reduced) {
        // Calm fallback: final frame, no motion.
        gsap.set(q("[data-k=liquid]"), { opacity: 1, attr: { cy: 200.8, rx: 16.4, ry: 4.1 } });
        gsap.set(q("[data-k=crema]"), { opacity: 0.8 });
        gsap.set(q("[data-k=halo]"), { opacity: 0.6 });
        gsap.set(q("[data-k=number]"), { opacity: 1 });
        gsap.set(disp, { attr: { scale: 0 } });
        gsap.set(blur, { attr: { stdDeviation: 0.3 } });
        gsap.set(q("[data-k=tag1], [data-k=tag2]"), { opacity: 1, y: 0 });
        gsap.set(q("[data-k=stream], [data-k=wisp]"), { opacity: 0 });
        gsap.set(q("[data-k=black]"), { opacity: 0 });
        setMood("cheer");
        const t = setTimeout(() => done.current?.(), full ? 900 : 400);
        return () => clearTimeout(t);
      }

      // starting positions
      gsap.set(q("[data-k=liquid]"), { opacity: 0, attr: { cy: 203.5, rx: 8, ry: 1.8 } });
      gsap.set(q("[data-k=crema]"), { opacity: 0 });
      gsap.set(q("[data-k=halo]"), { opacity: 0 });
      gsap.set(q("[data-k=stream]"), { strokeDasharray: 60, strokeDashoffset: 60, opacity: 1 });
      gsap.set(q("[data-k=number]"), { opacity: 0, y: 34 });
      gsap.set(disp, { attr: { scale: 80 } });
      gsap.set(blur, { attr: { stdDeviation: 9 } });
      gsap.set(q("[data-k=tag1], [data-k=tag2]"), { opacity: 0, y: -50 });
      gsap.set(q("[data-k=wisp]"), { strokeDasharray: 110, strokeDashoffset: 110, opacity: 0 });
      gsap.set(q("[data-k=black]"), { opacity: full ? 1 : 0 });

      const tl = gsap.timeline({ onComplete: () => done.current?.() });
      const pour = q("[data-k=pour]");
      const k = full ? 1 : 0.42; // the tablet version runs ~2.4x faster

      if (full) tl.to(q("[data-k=black]"), { opacity: 0, duration: 0.33, ease: onTwos(0.33) });
      tl.call(() => setMood("pour"))
        .call(play(sounds.squish))
        // anticipation: lean back first, like a real animator would pose it
        .to(pour, { rotation: -6, svgOrigin: PIVOT, duration: 0.17 * k, ease: onTwos(0.17 * k) })
        .to(pour, { rotation: TILT, svgOrigin: PIVOT, duration: 0.42 * k, ease: onTwos(0.42 * k) })
        .call(play(() => sounds.pour(0.9 * k)))
        .to(q("[data-k=stream]"), { strokeDashoffset: 0, duration: Math.max(0.083, 0.17 * k), ease: onTwos(0.17 * k) })
        .to(q("[data-k=liquid]"), { opacity: 1, attr: { cy: 200.8, rx: 16.4, ry: 4.1 }, duration: 0.9 * k, ease: onTwos(0.9 * k) }, "<")
        .to(q("[data-k=crema]"), { opacity: 0.8, duration: 0.25 * k, ease: onTwos(0.25 * k) }, ">-0.2")
        .to(q("[data-k=stream]"), { strokeDashoffset: -60, duration: Math.max(0.083, 0.17 * k), ease: onTwos(0.17 * k) })
        .to(pour, { rotation: 0, svgOrigin: PIVOT, duration: 0.33 * k, ease: onTwos(0.33 * k) }, "<")
        .call(play(sounds.clink))
        .call(() => setMood("idle"));
      if (full) {
        tl.to(q("[data-k=hop]"), { keyframes: [{ y: -8 }, { y: -12 }, { y: -5 }, { y: 0 }], duration: 0.33, ease: onTwos(0.33) })
          .to(q("[data-k=wisp]"), { opacity: 0.9, duration: 0.17, ease: onTwos(0.17), stagger: 0.08 })
          .to(q("[data-k=wisp]"), { strokeDashoffset: 0, y: -26, duration: 0.83, ease: onTwos(0.83), stagger: 0.08 }, "<")
          .to(q("[data-k=cam]"), { scale: 1.12, svgOrigin: `${CUP_X} 170`, duration: 2.4, ease: onTwos(2.4) }, "<");
      }
      // steam drifts up out of the cup and condenses into the number
      tl.to(q("[data-k=number]"), { opacity: 0.95, y: 0, duration: 1.0 * k, ease: onTwos(1.0 * k) }, full ? "-=1.9" : ">")
        .to(disp, { attr: { scale: 1.5 }, duration: 1.0 * k, ease: onTwos(1.0 * k) }, "<")
        .to(blur, { attr: { stdDeviation: 0.35 }, duration: 1.0 * k, ease: onTwos(1.0 * k) }, "<")
        .to(q("[data-k=halo]"), { opacity: 0.6, duration: 0.5 * k, ease: onTwos(0.5 * k) }, "<0.3");
      if (full) tl.to(q("[data-k=wisp]"), { opacity: 0, duration: 0.33, ease: onTwos(0.33) }, "<0.4");
      // paper labels drop in with a stepped bounce
      tl.call(play(sounds.rustle))
        .to(q("[data-k=tag1]"), { opacity: 1, keyframes: [{ y: -18 }, { y: 6 }, { y: -3 }, { y: 0 }], duration: 0.33, ease: onTwos(0.33) })
        .to(q("[data-k=tag2]"), { opacity: 1, keyframes: [{ y: -18 }, { y: 5 }, { y: -2 }, { y: 0 }], duration: 0.33, ease: onTwos(0.33) }, full ? "<0.17" : "<")
        .call(() => setMood("cheer"), [], "<")
        .to({}, { duration: full ? 0.9 : 0.15 });
    }, el);
    return () => ctx.revert();
  }, [reduced, full, sound]);

  // ---- parallax on phone tilt / mouse move (full version only) -------------
  useEffect(() => {
    const el = root.current;
    if (!el || !full || reduced) return;
    const set = (x: number, y: number) => {
      el.style.setProperty("--px", x.toFixed(2));
      el.style.setProperty("--py", y.toFixed(2));
    };
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      set(((e.clientX - r.left) / r.width - 0.5) * 2, ((e.clientY - r.top) / r.height - 0.5) * 2);
    };
    const onTilt = (e: DeviceOrientationEvent) => set(Math.max(-1, Math.min(1, (e.gamma ?? 0) / 25)), Math.max(-1, Math.min(1, ((e.beta ?? 45) - 45) / 25)));
    window.addEventListener("pointermove", onMove);
    window.addEventListener("deviceorientation", onTilt);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("deviceorientation", onTilt);
    };
  }, [full, reduced]);

  const p = palette;
  const glass = [p.accent2, "#e3a73c", p.accent, "#f2c14e", p.accent2];
  const par = (depth: number) => ({ transform: `translate(calc(var(--px, 0) * ${depth}px), calc(var(--py, 0) * ${depth * 0.6}px))` });

  return (
    <div ref={root} className={`relative aspect-[4/3] w-full overflow-hidden rounded-[22px] bg-[#120b07] ${reduced ? "motion-reduced" : ""} ${className}`} aria-label={`Checked in! ${streakWeeks}-week streak`} role="img">
      <svg viewBox="0 0 400 300" className="absolute inset-0 h-full w-full" aria-hidden>
        <defs>
          <ClayDefs id={id} palette={p} />
          <linearGradient id={`${id}-wall`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2e1c10" />
            <stop offset="100%" stopColor="#170e08" />
          </linearGradient>
          <linearGradient id={`${id}-wood`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7a4a28" />
            <stop offset="100%" stopColor="#3e2514" />
          </linearGradient>
          <radialGradient id={`${id}-glow`}>
            <stop offset="0%" stopColor="#ffb347" stopOpacity="0.75" />
            <stop offset="100%" stopColor="#ffb347" stopOpacity="0" />
          </radialGradient>
          <filter id={`${id}-dofbg`} x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="2.4" /></filter>
          <filter id={`${id}-doffg`} x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3.6" /></filter>
          <filter id={`${id}-grainwood`} x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.012 0.32" numOctaves="3" seed="8" />
            <feColorMatrix values="0 0 0 0 0.16  0 0 0 0 0.08  0 0 0 0 0.03  0 0 0 1.1 -0.35" />
          </filter>
          <filter id={`${id}-paper`} x="-20%" y="-30%" width="140%" height="160%">
            <feTurbulence type="fractalNoise" baseFrequency="0.6" numOctaves="1" seed="3" result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale="1.6" result="d" />
            <feDropShadow dx="1.5" dy="2.5" stdDeviation="1.2" floodColor="#000" floodOpacity="0.45" />
          </filter>
          {/* steam -> number: noise displacement that settles down */}
          <filter id={`${id}-steam`} x="-40%" y="-40%" width="180%" height="180%">
            <feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="2" seed="6" result="n" />
            <feDisplacementMap data-k="steam-disp" in="SourceGraphic" in2="n" scale="70" xChannelSelector="R" yChannelSelector="G" result="d" />
            <feGaussianBlur data-k="steam-blur" in="d" stdDeviation="9" result="b" />
            <feGaussianBlur in="b" stdDeviation="5" result="glow" />
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="b" />
            </feMerge>
          </filter>
          <filter id={`${id}-wisp`} x="-50%" y="-20%" width="200%" height="140%">
            <feTurbulence type="fractalNoise" baseFrequency="0.07" numOctaves="2" seed="2" result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale="6" />
            <feGaussianBlur stdDeviation="1.6" />
          </filter>
        </defs>

        <g data-k="cam">
          {/* ---------- background (out of focus) ---------- */}
          <g style={par(-6)}>
            <rect x="-20" y="-20" width="440" height="270" fill={`url(#${id}-wall)`} />
            <g filter={`url(#${id}-dofbg)`}>
              {/* candle glow from the window and lantern */}
              <circle className="candle-flicker" cx="295" cy="90" r="95" fill={`url(#${id}-glow)`} />
              <circle className="candle-flicker" cx="70" cy="62" r="70" fill={`url(#${id}-glow)`} style={{ animationDelay: "-0.7s" }} />
              {/* Sana'a tower-house window: gypsum frame + stained-glass half moon */}
              <rect x="247" y="58" width="96" height="104" rx="3" fill="#e9dcc2" opacity="0.92" />
              <rect x="256" y="68" width="78" height="86" fill="#140d09" />
              <path d="M295 68 V154 M256 98 H334 M256 126 H334" stroke="#e9dcc2" strokeWidth="3" opacity="0.8" />
              <path d="M251 60 A44 44 0 0 1 339 60 Z" fill="#e9dcc2" />
              {qamariya(295, 60, 36, glass)}
              <path d="M247 58 h96" stroke="#e9dcc2" strokeWidth="4" />
              {/* white gypsum zigzag trim, typical of Sana'a facades */}
              <path d="M241 172 l6 -7 l6 7 l6 -7 l6 7 l6 -7 l6 7 l6 -7 l6 7 l6 -7 l6 7 l6 -7 l6 7 l6 -7 l6 7 l6 -7 l6 7" fill="none" stroke="#e9dcc2" strokeWidth="2.5" opacity="0.75" />
              {/* hanging lantern */}
              <path d="M70 0 V34" stroke="#5a3a20" strokeWidth="2" />
              <path d="M58 40 L70 30 L82 40 Z" fill="#8a5a2b" />
              <rect x="58" y="40" width="24" height="34" rx="4" fill="#f6b84b" />
              <path d="M64 40 V74 M70 40 V74 M76 40 V74" stroke="#8a5a2b" strokeWidth="1.6" />
              <path d="M56 74 h28 l-4 7 h-20 Z" fill="#8a5a2b" />
            </g>
          </g>

          {/* ---------- the table (in focus) ---------- */}
          <rect x="-20" y="228" width="440" height="90" fill={`url(#${id}-wood)`} />
          <rect x="-20" y="228" width="440" height="90" filter={`url(#${id}-grainwood)`} />
          <path d="M-20 228.5 H420" stroke="#a36b3c" strokeWidth="1.5" opacity="0.7" />

          {/* cup shadow + finjan (clay) */}
          <ellipse cx={CUP_X} cy="236" rx="24" ry="4" fill="#000" opacity="0.35" />
          <g filter={`url(#${id}-clay-${frame})`}>
            <path d="M280.5 200 L319.5 200 C318.5 222 312 233 300 234 C288 233 281.5 222 280.5 200 Z" fill="#efe2c8" />
            <path d="M283.5 214 Q300 219 316.5 214" fill="none" stroke={p.accent2} strokeWidth="3" />
            <path d="M286 221 Q300 225 314 221" fill="none" stroke={p.accent} strokeWidth="2" />
            {/* we look slightly down into the cup: dark inside, coffee surface rises */}
            <ellipse cx={CUP_X} cy="200" rx="19.5" ry="5.5" fill="#fbf3e2" />
            <ellipse cx={CUP_X} cy="200.6" rx="17" ry="4.4" fill="#5c4632" />
            <ellipse data-k="liquid" cx={CUP_X} cy="203" rx="9" ry="2.2" fill="#3b2213" opacity="0" />
            <ellipse data-k="crema" cx={CUP_X - 4} cy="200" rx="6" ry="1.4" fill="#a8743f" opacity="0" />
          </g>

          {/* coffee stream from spout to cup */}
          <path data-k="stream" d="M287.5 183 C294 186 299 196 300 214" fill="none" stroke="#4a2a15" strokeWidth="4" strokeLinecap="round" opacity="0" />

          {/* the dallah (tilts around its base to pour) */}
          <g data-k="pour">
            <g data-k="hop">
              <g transform="translate(140 92) scale(0.62)">
                <DallahArt id={id} mood={mood} palette={p} frame={frame} />
              </g>
            </g>
          </g>

          {/* steam wisps rising from the cup */}
          <g filter={`url(#${id}-wisp)`}>
            {[
              "M292 198 C284 180 302 170 292 150 C284 134 296 124 290 108",
              "M300 198 C308 178 292 166 302 146 C310 130 298 120 304 104",
              "M308 198 C316 182 302 172 312 154 C318 140 308 130 314 114",
            ].map((d, i) => (
              <path key={i} data-k="wisp" d={d} fill="none" stroke="#fff6e6" strokeWidth="7" strokeLinecap="round" opacity="0" />
            ))}
          </g>

          {/* soft dark halo so the steam number reads against the window */}
          <ellipse data-k="halo" cx={CUP_X} cy="108" rx="52" ry="40" fill="#120b07" opacity="0" filter={`url(#${id}-doffg)`} />
          {/* the streak number, made of steam */}
          <text
            data-k="number"
            x={CUP_X}
            y="132"
            textAnchor="middle"
            fontSize={streakWeeks > 99 ? 54 : 74}
            fontWeight={800}
            fill="#fff6e6"
            filter={`url(#${id}-steam)`}
            opacity="0"
            style={{ fontFamily: "ui-rounded, 'SF Pro Rounded', system-ui, sans-serif" }}
          >
            {streakWeeks}
          </text>

          {/* paper cutout labels */}
          <PaperTag dataKey="tag1" x={CUP_X - 58} y={142} w={116} h={22} color="#f3e6cc" text="WEEK STREAK" textColor="#3b2213" rotate={-3} filter={`url(#${id}-paper)`} />
          {xpGained ? (
            <PaperTag dataKey="tag2" x={150} y={40} w={92} h={26} color={p.accent2} text={`+${xpGained} XP`} textColor="#fff8ec" rotate={-7} size={15} filter={`url(#${id}-paper)`} />
          ) : (
            <g data-k="tag2" />
          )}

          {/* ---------- foreground (very close to the lens, out of focus) ---------- */}
          <g style={par(12)} filter={`url(#${id}-doffg)`} opacity="0.95">
            <g transform="translate(26 288) rotate(-20)">
              <ellipse rx="22" ry="15" fill="#2f1b10" />
              <path d="M-18 0 C-6 -5, 6 5, 18 0" stroke="#170c06" strokeWidth="3" fill="none" />
            </g>
            <g transform="translate(72 300) rotate(25)">
              <ellipse rx="18" ry="12" fill="#3a2214" />
              <path d="M-14 0 C-5 -4, 5 4, 14 0" stroke="#170c06" strokeWidth="3" fill="none" />
            </g>
            <ellipse cx="372" cy="288" rx="22" ry="9" fill="#7f8f4f" transform="rotate(-25 372 288)" />
            <ellipse cx="396" cy="276" rx="18" ry="8" fill="#6d7d42" transform="rotate(15 396 276)" />
          </g>
        </g>
      </svg>

      {/* cinematic layer */}
      <div className="film-grain" aria-hidden />
      <div className="vignette" aria-hidden />
      <div data-k="black" className="pointer-events-none absolute inset-0 bg-black" style={{ opacity: full && !reduced ? 1 : 0 }} aria-hidden />
    </div>
  );
}
