"use client";
/**
 * THE MASCOT: a cheeky little clay dallah (Arabic coffee pot).
 *
 * Built entirely from SVG (no image files), so it is tiny, sharp at any size
 * and re-colorable per café (`mascotPalette(primaryColor)`).
 *
 * The handmade look comes from three tricks:
 *  1. Clay filter: soft lighting + a fingerprint-y bump texture on the shape.
 *  2. "Boil": 3 versions of that filter with different random seeds, swapped
 *     12 times a second, so the outline wobbles like re-sculpted clay.
 *  3. Stepped animation: poses are held frame by frame (CSS steps), never
 *     smoothly tweened, like a puppet moved by hand between shots.
 *
 * Moods: idle (blinks, steam puffs) · pour · dance (level up) ·
 *        worried (streak about to end) · cheer (reward unlocked)
 */
import { useId } from "react";
import { mix } from "@/lib/color";
import { useBoil, useReducedMotion } from "./stopmotion";

export type Mood = "idle" | "pour" | "dance" | "worried" | "cheer";

export type MascotPalette = {
  body: string; // main clay color
  shade: string; // darker clay for depth
  light: string; // highlights
  accent: string; // terracotta details
  accent2: string; // teal details
  ink: string; // eyes / mouth
};

/** Derive the mascot's clay colors from a café's brand color. */
export function mascotPalette(primary: string, accents?: { accent?: string; accent2?: string }): MascotPalette {
  return {
    body: primary,
    shade: mix(primary, "#2a160a", 0.42),
    light: mix(primary, "#fff4dc", 0.45),
    accent: accents?.accent ?? "#c0573e",
    accent2: accents?.accent2 ?? "#2a8c8c",
    ink: "#2a160c",
  };
}

/** SVG <defs> for the clay look. Put once inside any <svg> that draws a dallah. */
export function ClayDefs({ id, palette }: { id: string; palette: MascotPalette }) {
  return (
    <>
      {[0, 1, 2].map((f) => (
        <filter key={f} id={`${id}-clay-${f}`} x="-15%" y="-15%" width="130%" height="130%" colorInterpolationFilters="sRGB">
          {/* low-frequency noise = the "boil" wobble of the outline */}
          <feTurbulence type="fractalNoise" baseFrequency="0.028" numOctaves="2" seed={f * 17 + 3} result="warp" />
          {/* high-frequency noise = fingerprints / clay grain */}
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="1" seed={f * 5 + 11} result="grain" />
          <feGaussianBlur in="SourceAlpha" stdDeviation="5" result="soft" />
          <feComposite in="soft" in2="grain" operator="arithmetic" k2="1" k3="0.14" result="bump" />
          <feDiffuseLighting in="bump" surfaceScale="5" diffuseConstant="1.18" lightingColor="#fff6e8" result="light">
            <feDistantLight azimuth="235" elevation="52" />
          </feDiffuseLighting>
          <feComposite in="SourceGraphic" in2="light" operator="arithmetic" k1="1" result="lit" />
          <feSpecularLighting in="bump" surfaceScale="5" specularConstant="0.5" specularExponent="20" lightingColor="#fff1d0" result="spec">
            <feDistantLight azimuth="235" elevation="58" />
          </feSpecularLighting>
          <feComposite in="spec" in2="SourceAlpha" operator="in" result="specIn" />
          <feComposite in="lit" in2="specIn" operator="arithmetic" k2="1" k3="0.55" result="shiny" />
          <feDisplacementMap in="shiny" in2="warp" scale="3.4" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      ))}
      {/* felt-like steam puffs */}
      <filter id={`${id}-felt`} filterUnits="userSpaceOnUse" x="140" y="0" width="100" height="120">
        <feTurbulence type="fractalNoise" baseFrequency="0.12" numOctaves="2" seed="4" result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale="5" />
        <feGaussianBlur stdDeviation="0.8" />
      </filter>
      <radialGradient id={`${id}-belly`} cx="38%" cy="35%" r="70%">
        <stop offset="0%" stopColor={palette.light} />
        <stop offset="55%" stopColor={palette.body} />
        <stop offset="100%" stopColor={palette.shade} />
      </radialGradient>
      <linearGradient id={`${id}-metal`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor={palette.shade} />
        <stop offset="45%" stopColor={palette.light} />
        <stop offset="100%" stopColor={palette.shade} />
      </linearGradient>
    </>
  );
}

const MOUTHS: Record<Mood, string> = {
  idle: "M90 190 Q100 199 110 190",
  pour: "M93 192 Q100 195 107 192",
  dance: "M88 188 Q100 206 112 188 Q100 194 88 188 Z",
  cheer: "M86 186 Q100 210 114 186 Q100 192 86 186 Z",
  worried: "M89 194 Q94 189 100 194 Q106 199 111 193",
};

/** The dallah drawing itself (a <g>), in a 200 x 250 box. */
export function DallahArt({ id, mood, palette, frame }: { id: string; mood: Mood; palette: MascotPalette; frame: number }) {
  const p = palette;
  const open = mood === "dance" || mood === "cheer";
  return (
    <g className={`dl dl-${mood}`}>
      {/* contact shadow on the table */}
      <ellipse cx="100" cy="238" rx="56" ry="7" fill="#000" opacity="0.28" className="dl-shadow" />
      <g className="dl-root">
        <g filter={`url(#${id}-clay-${frame})`}>
          {/* feet */}
          <ellipse cx="82" cy="233" rx="13" ry="7" fill={p.shade} />
          <ellipse cx="118" cy="233" rx="13" ry="7" fill={p.shade} />
          {/* handle (back) */}
          <path d="M84 112 C44 100, 30 150, 62 176" fill="none" stroke={p.shade} strokeWidth="10" strokeLinecap="round" />
          {/* base ring */}
          <ellipse cx="100" cy="221" rx="40" ry="9" fill={p.shade} />
          {/* belly */}
          <path d="M60 214 C38 198, 38 158, 66 138 C78 129, 122 129, 134 138 C162 158, 162 198, 140 214 C124 224, 76 224, 60 214 Z" fill={`url(#${id}-belly)`} />
          {/* decorative band of little triangles, like Yemeni carving */}
          <path d="M70 139 Q100 131 130 139" fill="none" stroke={p.accent2} strokeWidth="4" strokeLinecap="round" />
          {[76, 88, 100, 112].map((x, i) => (
            <path key={x} d={`M${x - 5} ${138 - (i === 0 || i === 3 ? 0 : 1.5)} l5 6 l5 -6 Z`} fill={i % 2 ? p.accent : p.accent2} />
          ))}
          {/* spout (long beak) */}
          <path d="M126 156 C150 150, 158 122, 166 102 L184 86 L177 104 C170 130, 154 160, 132 168 Z" fill={`url(#${id}-metal)`} />
          <path d="M175 96 L184 86" stroke={p.light} strokeWidth="2" strokeLinecap="round" />
          {/* waist */}
          <path d="M80 138 L86 104 L114 104 L120 138 Z" fill={`url(#${id}-metal)`} />
          <ellipse cx="100" cy="105" rx="17" ry="4" fill={p.accent} />
          {/* flared collar */}
          <path d="M84 107 C68 96, 70 84, 88 80 L112 80 C130 84, 132 96, 116 107 Z" fill={`url(#${id}-belly)`} />
          {/* lid dome + spire */}
          <path d="M86 83 C86 61, 114 61, 114 83 Z" fill={p.body} />
          <path d="M97 66 C96 52, 99 40, 100 31 C101 40, 104 52, 103 66 Z" fill={p.shade} />
          <circle cx="100" cy="29" r="5.5" fill={p.accent} />
          {/* left arm */}
          <g className="dl-arm dl-arm-l">
            <path d="M60 178 C50 182, 44 188, 40 196" fill="none" stroke={p.shade} strokeWidth="11.5" strokeLinecap="round" />
            <path d="M60 178 C50 182, 44 188, 40 196" fill="none" stroke={p.body} strokeWidth="7.5" strokeLinecap="round" />
            <circle cx="39" cy="198" r="7.5" fill={p.shade} />
            <circle cx="39" cy="198" r="5.6" fill={p.light} />
          </g>
          {/* right arm */}
          <g className="dl-arm dl-arm-r">
            <path d="M140 178 C150 182, 156 188, 160 196" fill="none" stroke={p.shade} strokeWidth="11.5" strokeLinecap="round" />
            <path d="M140 178 C150 182, 156 188, 160 196" fill="none" stroke={p.body} strokeWidth="7.5" strokeLinecap="round" />
            <circle cx="161" cy="198" r="7.5" fill={p.shade} />
            <circle cx="161" cy="198" r="5.6" fill={p.light} />
          </g>
          {/* face */}
          <g className="dl-face">
            <circle cx="73" cy="184" r="6.5" fill={p.accent} opacity="0.45" />
            <circle cx="127" cy="184" r="6.5" fill={p.accent} opacity="0.45" />
            {[84, 116].map((x) => (
              <g key={x}>
                <ellipse cx={x} cy="166" rx="9" ry="11" fill="#fffaf0" />
                <g className="dl-pupil">
                  <circle cx={x + 1} cy="168" r="5.2" fill={p.ink} />
                  <circle cx={x + 3} cy="165" r="1.8" fill="#fff" />
                </g>
                <ellipse className="dl-lid" cx={x} cy="166" rx="9.6" ry="11.6" fill={p.body} />
              </g>
            ))}
            {/* brows */}
            {mood === "worried" ? (
              <>
                <path d="M75 152 L91 148" stroke={p.ink} strokeWidth="3" strokeLinecap="round" />
                <path d="M109 148 L125 152" stroke={p.ink} strokeWidth="3" strokeLinecap="round" />
              </>
            ) : mood === "cheer" || mood === "dance" ? (
              <>
                <path d="M76 150 Q84 145 92 150" fill="none" stroke={p.ink} strokeWidth="3" strokeLinecap="round" />
                <path d="M108 150 Q116 145 124 150" fill="none" stroke={p.ink} strokeWidth="3" strokeLinecap="round" />
              </>
            ) : null}
            <path d={MOUTHS[mood]} fill={open ? p.ink : "none"} stroke={p.ink} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            {open && <path d="M94 197 Q100 202 106 197" fill={p.accent} opacity="0.9" />}
          </g>
          {mood === "worried" && <path className="dl-sweat" d="M142 140 C138 148, 138 154, 142 156 C146 154, 146 148, 142 140 Z" fill="#bfe6f2" />}
        </g>
      </g>
      {/* steam puffs from the spout (felt balls) */}
      {(mood === "idle" || mood === "worried") && (
        <g filter={`url(#${id}-felt)`} className="dl-steam">
          {[0, 1, 2].map((i) => (
            <circle key={i} className="dl-puff" style={{ animationDelay: `${i * 0.6}s` }} cx="186" cy="80" r="6" fill="#fff8ee" />
          ))}
        </g>
      )}
    </g>
  );
}

/** Stand-alone mascot. */
export function Dallah({
  mood = "idle",
  size = 160,
  palette,
  className = "",
  label = "Dallah mascot",
  onClick,
}: {
  mood?: Mood;
  size?: number;
  palette: MascotPalette;
  className?: string;
  label?: string;
  onClick?: () => void;
}) {
  const id = useId().replace(/:/g, "");
  const frame = useBoil();
  const reduced = useReducedMotion();
  return (
    <svg
      viewBox="0 0 200 250"
      width={size}
      height={(size * 250) / 200}
      role="img"
      aria-label={label}
      className={`${reduced ? "dl-still" : ""} ${onClick ? "cursor-pointer" : ""} ${className}`}
      onClick={onClick}
      style={{ overflow: "visible" }}
    >
      <defs>
        <ClayDefs id={id} palette={palette} />
      </defs>
      <DallahArt id={id} mood={mood} palette={palette} frame={frame} />
    </svg>
  );
}
