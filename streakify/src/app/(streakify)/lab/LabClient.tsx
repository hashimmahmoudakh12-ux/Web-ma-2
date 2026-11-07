"use client";
import { useState } from "react";
import { CafeTheme } from "@/components/CafeTheme";
import { isMuted, setMuted, sounds } from "@/components/game/feedback";
import { CheckInScene } from "@/components/motion/CheckInScene";
import { Dallah, mascotPalette, type Mood } from "@/components/motion/Dallah";
import { MotionOverride } from "@/components/motion/stopmotion";
import type { Brand } from "@/lib/brand";

type Theme = { name: string; brand: Brand };

const MOODS: { mood: Mood; label: string; when: string }[] = [
  { mood: "idle", label: "Idle", when: "Blinks, steam puffs from the spout" },
  { mood: "dance", label: "Dance", when: "Level up" },
  { mood: "worried", label: "Worried", when: "Streak about to end" },
  { mood: "cheer", label: "Cheer", when: "Reward unlocked" },
  { mood: "pour", label: "Pour", when: "Pouring during check-in" },
];

export function LabClient({ themes }: { themes: Theme[] }) {
  const [themeIdx, setThemeIdx] = useState(0);
  const [custom, setCustom] = useState<string | null>(null);
  const [mood, setMood] = useState<Mood>("idle");
  const [reduced, setReduced] = useState(false);
  const [muted, setMutedState] = useState(false);
  const [weeks, setWeeks] = useState(5);
  const [xp, setXp] = useState(240);
  const [takeFull, setTakeFull] = useState(0);
  const [takeShort, setTakeShort] = useState(0);
  const [fullDone, setFullDone] = useState(false);

  const base = themes[themeIdx].brand;
  const brand: Brand = custom ? { ...base, colors: { ...base.colors, primary: custom } } : base;
  const palette = mascotPalette(brand.colors.primary);

  const btn = (active: boolean) =>
    `pressable rounded-full px-4 py-2 text-sm font-semibold ${active ? "bg-brand-primary text-brand-on-primary" : "bg-brand-surface"}`;

  return (
    <MotionOverride.Provider value={reduced ? true : null}>
      <CafeTheme brand={brand} scheme="dark">
        <main className="mx-auto w-full max-w-6xl space-y-8 px-4 py-8">
          <header className="space-y-2">
            <p className="text-sm uppercase tracking-[0.3em] text-brand-primary">Streakify motion lab</p>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Stop-motion mascot + check-in</h1>
            <p className="max-w-2xl text-brand-muted">
              Everything here is SVG drawn in code (no image files), animated at 12 frames per second like a handmade stop-motion film. The clay
              &ldquo;boils&rdquo; (wobbles) every frame. Colors follow each café&apos;s theme.
            </p>
            <p className="text-sm">
              <a className="text-brand-primary underline" href="/lab/film">Full-screen check-in film</a> ·{" "}
              <a className="text-brand-primary underline" href="/lab/moods">All mascot moods</a>
            </p>
          </header>

          <section className="flex flex-wrap items-center gap-2">
            {themes.map((t, i) => (
              <button key={t.name} type="button" className={btn(i === themeIdx && !custom)} onClick={() => (setThemeIdx(i), setCustom(null))}>
                {t.name}
              </button>
            ))}
            <label className="flex items-center gap-2 rounded-full bg-brand-surface px-3 py-1.5 text-sm">
              Any café color <input type="color" value={custom ?? brand.colors.primary} onChange={(e) => setCustom(e.target.value)} className="h-6 w-8" />
            </label>
            <span className="mx-2 h-6 w-px bg-brand-muted/30" />
            <button type="button" className={btn(reduced)} onClick={() => setReduced(!reduced)}>
              Reduce motion: {reduced ? "on" : "off"}
            </button>
            <button
              type="button"
              className={btn(!muted)}
              onClick={() => {
                const m = !isMuted();
                setMuted(m);
                setMutedState(m);
                if (!m) sounds.clink();
              }}
            >
              Sound: {muted ? "off" : "on"}
            </button>
          </section>

          <section className="grid gap-6 rounded-[28px] bg-brand-surface p-6 md:grid-cols-[300px_1fr]">
            <div className="flex flex-col items-center justify-end rounded-[22px] bg-gradient-to-b from-[#2e1c10] to-[#170e08] p-6">
              <Dallah
                key={`${mood}-${reduced}`}
                mood={mood}
                size={220}
                palette={palette}
                onClick={() => {
                  sounds.squish();
                  setMood("cheer");
                }}
              />
              <p className="mt-2 text-xs text-[#b3a089]">Tap him</p>
            </div>
            <div className="space-y-3">
              <h2 className="text-xl font-semibold">The mascot: a cheeky clay dallah</h2>
              <p className="text-brand-muted">Original character, re-colored from the café&apos;s main color. Try each reaction:</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {MOODS.map((m) => (
                  <button
                    key={m.mood}
                    type="button"
                    onClick={() => {
                      setMood(m.mood);
                      sounds.squish();
                    }}
                    className={`pressable rounded-2xl p-3 text-left ${mood === m.mood ? "bg-brand-primary text-brand-on-primary" : "bg-brand-bg"}`}
                  >
                    <span className="block font-semibold">{m.label}</span>
                    <span className={`text-sm ${mood === m.mood ? "opacity-80" : "text-brand-muted"}`}>{m.when}</span>
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">Check-in animation</h2>
                <p className="text-brand-muted">The dallah pours a finjan, the steam forms the streak number.</p>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <label className="flex items-center gap-2">
                  Streak weeks <input type="number" min={1} max={999} value={weeks} onChange={(e) => setWeeks(Math.max(1, Number(e.target.value) || 1))} className="w-20 rounded-lg bg-brand-surface px-2 py-1" />
                </label>
                <label className="flex items-center gap-2">
                  XP <input type="number" min={0} value={xp} onChange={(e) => setXp(Math.max(0, Number(e.target.value) || 0))} className="w-20 rounded-lg bg-brand-surface px-2 py-1" />
                </label>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
              <div className="space-y-2">
                <p className="font-semibold">Customer&apos;s phone (full cinematic, ~4.5 s)</p>
                <div className="mx-auto w-full max-w-[400px] rounded-[44px] border-[10px] border-black bg-black p-0 shadow-2xl">
                  <div className="flex aspect-[9/16] flex-col justify-center overflow-hidden rounded-[34px] bg-[#0d0805]">
                    <CheckInScene
                      key={`full-${takeFull}-${reduced}-${weeks}-${xp}-${palette.body}`}
                      variant="full"
                      streakWeeks={weeks}
                      xpGained={xp}
                      palette={palette}
                      onDone={() => setFullDone(true)}
                    />
                    <p className={`mt-4 text-center text-sm text-[#b3a089] transition-opacity ${fullDone ? "opacity-100" : "opacity-0"}`}>Tap to continue</p>
                  </div>
                </div>
                <button type="button" className={btn(false)} onClick={() => (setFullDone(false), setTakeFull((n) => n + 1))}>
                  Replay phone version
                </button>
              </div>
              <div className="space-y-2">
                <p className="font-semibold">Counter tablet (short, under 2 s)</p>
                <div className="max-w-[460px]">
                  <CheckInScene key={`short-${takeShort}-${reduced}-${weeks}-${xp}-${palette.body}`} variant="short" streakWeeks={weeks} xpGained={xp} palette={palette} sound={false} />
                </div>
                <button type="button" className={btn(false)} onClick={() => setTakeShort((n) => n + 1)}>
                  Replay tablet version
                </button>
                <ul className="mt-4 max-w-xl list-disc space-y-1 pl-5 text-sm text-brand-muted">
                  <li>12 frames per second (&ldquo;on twos&rdquo;), every pose held then snapped, never smooth.</li>
                  <li>Clay boil: the outline is re-warped with a different noise pattern each frame.</li>
                  <li>Miniature set: Sana&apos;a tower-house window with a stained-glass half-moon and a lantern, out of focus behind; coffee beans and cardamom pods out of focus in front.</li>
                  <li>Film grain, vignette, flickering candlelight; slow camera push-in and tilt parallax on the phone version.</li>
                  <li>Sounds (phone only, mutable): clay squish, pour, cup clink, paper rustle.</li>
                  <li>&ldquo;Reduce motion&rdquo; shows the final frame calmly instead.</li>
                </ul>
              </div>
            </div>
          </section>
        </main>
      </CafeTheme>
    </MotionOverride.Provider>
  );
}
