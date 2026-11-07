"use client";
/**
 * Plays the full stop-motion check-in film once, the first time the customer
 * opens their app after a new check-in (remembered on the phone).
 * Level-ups and badges are celebrated right after it.
 */
import { useEffect, useState } from "react";
import { CheckInScene } from "@/components/motion/CheckInScene";
import { mascotPalette } from "@/components/motion/Dallah";
import type { AppData } from "../CustomerApp";

const key = (token: string) => `streakify:film:${token}`;

export function CheckInFilm({ data, onDone }: { data: AppData; onDone: () => void }) {
  const [show, setShow] = useState<boolean | null>(null);
  const [ended, setEnded] = useState(false);

  useEffect(() => {
    let seen: string | null = null;
    try {
      seen = localStorage.getItem(key(data.token));
    } catch {}
    const fresh = Boolean(data.lastVisit && data.lastVisit.at !== seen && Date.now() - new Date(data.lastVisit.at).getTime() < 12 * 3600_000);
    const t = setTimeout(() => {
      setShow(fresh);
      if (!fresh) onDone();
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!show || !data.lastVisit) return null;
  const close = () => {
    try {
      localStorage.setItem(key(data.token), data.lastVisit!.at);
    } catch {}
    setShow(false);
    onDone();
  };
  return (
    <div className="animate-fade fixed inset-0 z-40 flex flex-col items-center justify-center bg-[#0d0805] px-4" role="dialog" aria-modal="true" aria-label="Check-in" onClick={() => ended && close()}>
      <div className="w-full max-w-md">
        <CheckInScene variant="full" streakWeeks={data.streakWeeks} xpGained={data.lastVisit.xp || null} palette={mascotPalette(data.cafe.primary)} onDone={() => setEnded(true)} />
      </div>
      <p className="mt-6 text-center text-lg font-semibold text-[#f5ead8]">Checked in at {data.cafe.name}</p>
      <button type="button" onClick={close} className={`pressable mt-4 rounded-full bg-[#f5ead8]/10 px-6 py-2.5 text-[#f5ead8] transition-opacity ${ended ? "opacity-100" : "opacity-40"}`}>
        {ended ? "Continue" : "Skip"}
      </button>
    </div>
  );
}
