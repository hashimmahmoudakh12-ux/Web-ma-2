"use client";
/**
 * MYSTERY DALLAH: tap to open. The dallah (Arabic coffee pot) shakes,
 * pours, and reveals a prize. The prize is decided on the server, inside
 * the café's monthly budget, so the café never loses money.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { fireConfetti } from "@/components/game/Confetti";
import { haptics, sounds } from "@/components/game/feedback";
import { Sheet } from "@/components/Sheet";
import type { AppData } from "../CustomerApp";
import { openMysteryAction } from "../actions";

type Prize = { name: string; icon: string; xp: number; valueLabel: string | null };

export function MysteryCard({ data }: { data: AppData }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<"idle" | "shaking" | "revealed">("idle");
  const [prize, setPrize] = useState<Prize | null>(null);
  const [leveled, setLeveled] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!data.mystery.length && !open) return null;

  const start = async () => {
    setStage("shaking");
    setError(null);
    haptics.tap();
    const ticks = setInterval(() => sounds.tick(), 160);
    const [res] = await Promise.all([openMysteryAction(data.siteKey, data.token, data.mystery[0]), new Promise((r) => setTimeout(r, 1600))]);
    clearInterval(ticks);
    if (!res.ok) {
      setError(res.message);
      setStage("idle");
      return;
    }
    setPrize(res.prize);
    setLeveled(res.leveledUp);
    setStage("revealed");
    fireConfetti([data.cafe.primary, "#ffffff", "#ffd166"]);
    sounds.reward();
    haptics.success();
  };

  const close = () => {
    setOpen(false);
    setStage("idle");
    setPrize(null);
    router.refresh();
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="pressable card relative flex w-full items-center gap-4 overflow-hidden p-4 text-left">
        <span
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{ background: `linear-gradient(110deg, transparent 30%, ${data.cafe.primary} 50%, transparent 70%)`, backgroundSize: "200% 100%", animation: "shimmer 2.5s linear infinite" }}
        />
        <span className="animate-wobble text-5xl" aria-hidden>
          🫖
        </span>
        <span className="relative">
          <span className="block text-lg font-bold">
            {data.mystery.length === 1 ? "A mystery dallah is waiting!" : `${data.mystery.length} mystery dallahs are waiting!`}
          </span>
          <span className="text-sm text-brand-muted">Tap to open and see what you won</span>
        </span>
      </button>
      <Sheet open={open} onClose={close} title="Mystery dallah">
        <div className="flex flex-col items-center py-6 text-center">
          {stage !== "revealed" ? (
            <>
              <div className={`text-[120px] leading-none ${stage === "shaking" ? "animate-wobble" : "animate-float"}`} aria-hidden>
                🫖
              </div>
              <p className="mt-4 text-brand-muted">{stage === "shaking" ? "Pouring…" : "Every dallah hides a prize: XP, a treat, or something big."}</p>
              {error && <p className="mt-2 text-red-400">{error}</p>}
              <button
                type="button"
                disabled={stage === "shaking"}
                onClick={start}
                className="pressable mt-6 w-full rounded-2xl bg-brand-primary py-4 text-lg font-bold text-brand-on-primary disabled:opacity-60"
              >
                {stage === "shaking" ? "…" : "Open it"}
              </button>
            </>
          ) : (
            prize && (
              <>
                <div className="animate-pop text-[110px] leading-none" aria-hidden>
                  {prize.icon}
                </div>
                <p className="mt-4 text-sm font-semibold uppercase tracking-widest text-brand-primary">You won</p>
                <p className="mt-1 text-3xl font-bold">{prize.name}</p>
                {prize.valueLabel && <p className="mt-1 text-brand-muted">{prize.valueLabel} value · ready at the counter</p>}
                {leveled && <p className="mt-3 rounded-full bg-brand-primary/15 px-4 py-1.5 font-semibold text-brand-primary">…and you leveled up to {leveled}!</p>}
                <button type="button" onClick={close} className="pressable mt-6 w-full rounded-2xl bg-brand-primary py-4 text-lg font-bold text-brand-on-primary">
                  Awesome
                </button>
              </>
            )
          )}
        </div>
      </Sheet>
    </>
  );
}
