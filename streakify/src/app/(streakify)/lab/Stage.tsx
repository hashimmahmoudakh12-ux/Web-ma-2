"use client";
/** Full-screen preview stages for /lab/film and /lab/moods (great for screen recordings). */
import { useState } from "react";
import { CheckInScene } from "@/components/motion/CheckInScene";
import { Dallah, mascotPalette, type Mood } from "@/components/motion/Dallah";
import { sanaaCafe } from "@/lib/demo/cafes";

const palette = mascotPalette(sanaaCafe.brand.colors.primary);

export function FilmStage() {
  const [take, setTake] = useState(0);
  const [done, setDone] = useState(false);
  return (
    <div
      className="flex min-h-dvh cursor-pointer flex-col items-center justify-center bg-[#0d0805] p-4"
      onClick={() => {
        setDone(false);
        setTake((t) => t + 1);
      }}
    >
      <div className="w-full max-w-[min(100%,calc((100dvh-4rem)*4/3))]">
        <CheckInScene key={take} variant="full" streakWeeks={5} xpGained={240} palette={palette} onDone={() => setDone(true)} />
      </div>
      <p className={`mt-3 text-sm text-[#b3a089] transition-opacity ${done ? "opacity-100" : "opacity-0"}`}>Tap to replay</p>
    </div>
  );
}

const MOODS: [Mood, string][] = [
  ["idle", "Idle"],
  ["dance", "Level up"],
  ["worried", "Streak ending"],
  ["cheer", "Reward unlocked"],
];

export function MoodsStage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-b from-[#2e1c10] to-[#120b07] p-6">
      <div className="grid w-full max-w-5xl grid-cols-2 gap-6 md:grid-cols-4">
        {MOODS.map(([mood, label]) => (
          <figure key={mood} className="flex flex-col items-center">
            <Dallah mood={mood} size={190} palette={palette} />
            <figcaption className="mt-3 text-lg font-semibold text-[#f5ead8]">{label}</figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
