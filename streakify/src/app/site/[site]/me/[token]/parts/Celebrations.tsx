"use client";
/**
 * Plays anything new since the customer last opened the app: level-ups,
 * badges, milestones, rewards... one at a time, with confetti, sound and
 * haptics. Then marks them as seen so they don't replay.
 */
import { useEffect, useState } from "react";
import { fireConfetti } from "@/components/game/Confetti";
import { haptics, sounds } from "@/components/game/feedback";
import type { AppData } from "../CustomerApp";
import { markSeenAction } from "../actions";

const BIG = new Set(["level_up", "milestone", "category"]);

export function Celebrations({ data }: { data: AppData }) {
  const [queue, setQueue] = useState(data.celebrations);
  const current = queue[0];

  useEffect(() => {
    if (!current) return;
    const colors = [data.cafe.primary, "#ffffff", "#ffd166"];
    const t = setTimeout(() => {
      if (BIG.has(current.type)) {
        fireConfetti(colors);
        sounds.levelUp();
        haptics.levelUp();
      } else if (current.type === "badge") {
        fireConfetti(colors);
        sounds.badge();
        haptics.success();
      } else {
        sounds.reward();
        haptics.success();
      }
    }, 250);
    return () => clearTimeout(t);
  }, [current, data.cafe.primary]);

  if (!current) return null;
  const next = () => {
    const rest = queue.slice(1);
    setQueue(rest);
    if (!rest.length) void markSeenAction(data.siteKey, data.token, data.celebrations[data.celebrations.length - 1].at);
  };
  return (
    <div className="animate-fade fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-6" role="dialog" aria-modal="true" aria-label={current.title}>
      <div className="glass-surface animate-pop w-full max-w-sm rounded-[32px] p-8 text-center shadow-2xl">
        <div className="animate-float mx-auto text-7xl" aria-hidden>
          {current.icon}
        </div>
        <p className="mt-4 text-sm font-semibold uppercase tracking-widest text-brand-primary">{current.title}</p>
        <p className="mt-2 text-2xl font-bold">{current.body}</p>
        {queue.length > 1 && <p className="mt-2 text-sm text-brand-muted">+{queue.length - 1} more</p>}
        <button type="button" onClick={next} className="pressable mt-6 w-full rounded-2xl bg-brand-primary py-3.5 text-lg font-semibold text-brand-on-primary">
          {queue.length > 1 ? "Next" : "Nice!"}
        </button>
      </div>
    </div>
  );
}
