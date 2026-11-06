"use client";
import { useOptimistic, useTransition } from "react";
import { updatePrefs } from "./actions";

export function Prefs({
  siteKey,
  token,
  leaderboardOptIn,
  smsOptIn,
  smsConsent,
  privacyNotice,
}: {
  siteKey: string;
  token: string;
  leaderboardOptIn: boolean;
  smsOptIn: boolean;
  smsConsent: string;
  privacyNotice: string;
}) {
  const [state, setOptimistic] = useOptimistic({ leaderboardOptIn, smsOptIn });
  const [, start] = useTransition();
  const toggle = (key: "leaderboardOptIn" | "smsOptIn") =>
    start(async () => {
      const next = { ...state, [key]: !state[key] };
      setOptimistic(next);
      await updatePrefs(siteKey, token, { [key]: next[key] });
    });
  return (
    <div className="space-y-4 rounded-2xl bg-brand-surface p-5">
      <h2 className="text-lg font-semibold">Your settings</h2>
      <label className="flex items-start gap-3">
        <input type="checkbox" className="mt-1 h-5 w-5 accent-[var(--brand-primary)]" checked={state.leaderboardOptIn} onChange={() => toggle("leaderboardOptIn")} />
        <span>Show my first name on the monthly leaderboard (never my phone number)</span>
      </label>
      <label className="flex items-start gap-3">
        <input type="checkbox" className="mt-1 h-5 w-5 accent-[var(--brand-primary)]" checked={state.smsOptIn} onChange={() => toggle("smsOptIn")} />
        <span className="text-sm">{smsConsent}</span>
      </label>
      <p className="text-xs text-brand-muted">{privacyNotice}</p>
    </div>
  );
}
