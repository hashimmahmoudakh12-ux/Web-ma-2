"use client";
/** Settings sheet: leaderboard visibility, texts, push notifications, privacy. */
import { useOptimistic, useTransition } from "react";
import { Sheet } from "@/components/Sheet";
import type { AppData } from "../CustomerApp";
import { updatePrefs } from "../actions";
import { PushToggle } from "./pwa";

function Toggle({ on, onChange, children }: { on: boolean; onChange: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onChange} className="pressable flex w-full items-center justify-between gap-3 rounded-2xl bg-brand-bg px-4 py-3 text-left" role="switch" aria-checked={on}>
      <span className="text-sm">{children}</span>
      <span className={`h-7 w-12 shrink-0 rounded-full p-0.5 transition-colors ${on ? "bg-green-500" : "bg-brand-muted/40"}`}>
        <span className={`block h-6 w-6 rounded-full bg-white shadow transition-transform duration-300 ${on ? "translate-x-5" : ""}`} style={{ transitionTimingFunction: "var(--spring)" }} />
      </span>
    </button>
  );
}

export function SettingsSheet({ open, onClose, data }: { open: boolean; onClose: () => void; data: AppData }) {
  const [state, setOptimistic] = useOptimistic({ leaderboardOptIn: data.prefs.leaderboardOptIn, smsOptIn: data.prefs.smsOptIn });
  const [, start] = useTransition();
  const toggle = (key: "leaderboardOptIn" | "smsOptIn") =>
    start(async () => {
      const next = { ...state, [key]: !state[key] };
      setOptimistic(next);
      await updatePrefs(data.siteKey, data.token, { [key]: next[key] });
    });
  return (
    <Sheet open={open} onClose={onClose} title="Settings">
      <div className="space-y-3 pb-2">
        <Toggle on={state.leaderboardOptIn} onChange={() => toggle("leaderboardOptIn")}>
          Show my first name on the monthly leaderboard (never my phone number)
        </Toggle>
        <Toggle on={state.smsOptIn} onChange={() => toggle("smsOptIn")}>
          {data.prefs.smsConsent}
        </Toggle>
        {data.push.enabled && <PushToggle siteKey={data.siteKey} token={data.token} vapidKey={data.push.vapidKey} />}
        <p className="px-1 text-xs text-brand-muted">{data.prefs.privacyNotice}</p>
        <p className="px-1 text-xs text-brand-muted">Keep this link private: it opens your rewards. Powered by Streakify.</p>
      </div>
    </Sheet>
  );
}
