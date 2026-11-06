"use client";
/**
 * The settings editor. Money is typed in dollars and stored as cents.
 * Everything is validated again on the server before saving.
 */
import { useState, useTransition } from "react";
import type { Brand } from "@/lib/brand";
import type { Level, Program } from "@/lib/program";
import { saveSettings } from "../actions";

const toDollars = (c: number) => (c / 100).toFixed(2);
const toCents = (s: string) => Math.max(0, Math.round(Number(s || 0) * 100));

const input = "w-full rounded-lg bg-brand-bg px-3 py-2 outline-none ring-brand-primary focus:ring-2";

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="text-sm text-brand-muted">{label}</span>
      {children}
      {hint && <span className="text-xs text-brand-muted/80">{hint}</span>}
    </label>
  );
}

function Money({ value, onChange }: { value: number; onChange: (cents: number) => void }) {
  const [text, setText] = useState(toDollars(value));
  return (
    <div className="flex items-center gap-1">
      <span className="text-brand-muted">$</span>
      <input
        inputMode="decimal"
        className={input}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(toCents(e.target.value));
        }}
      />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-2xl bg-brand-surface p-5">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export function SettingsForm({ siteKey, program: initial, brand: initialBrand, currency }: { siteKey: string; program: Program; brand: Brand; currency: string }) {
  const [p, setP] = useState<Program>(initial);
  const [brand, setBrand] = useState<Brand>(initialBrand);
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  void currency;

  const setLevel = (i: number, patch: Partial<Level>) => setP({ ...p, levels: p.levels.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  const welcome = p.welcomeReward ?? { enabled: false, onVisit: 2, name: "$1.50 off", valueCents: 150, costCents: 150 };
  const surprise = p.surpriseReward ?? { enabled: false, chance: 0.05, name: "Free cookie", valueCents: 300, costCents: 60 };
  const birthday = p.birthdayReward ?? { enabled: false, windowDays: 7, name: "Free birthday drink", valueCents: 600, costCents: 150 };

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => setMsg(await saveSettings(siteKey, p, brand)));
      }}
    >
      <Section title="Levels">
        <p className="text-sm text-brand-muted">Customers move up by visiting. Missing a week drops them one level (rewards they earned are kept). The first level always starts at 0.</p>
        {p.levels.map((l, i) => (
          <div key={i} className="grid gap-3 rounded-xl border border-brand-text/10 p-4 sm:grid-cols-2">
            <Field label="Level name"><input className={input} value={l.name} onChange={(e) => setLevel(i, { name: e.target.value })} /></Field>
            <Field label="Visits needed">
              <input type="number" min={0} className={input} value={l.minVisits} disabled={i === 0} onChange={(e) => setLevel(i, { minVisits: Number(e.target.value) })} />
            </Field>
            {i > 0 && (
              <>
                <Field label="Reward when reached (blank = none)">
                  <input
                    className={input}
                    value={l.reward?.name ?? ""}
                    placeholder="e.g. Free pastry"
                    onChange={(e) =>
                      setLevel(i, { reward: e.target.value ? { valueCents: 0, costCents: 0, ...l.reward, name: e.target.value } : undefined })
                    }
                  />
                </Field>
                <Field label="Perk at this level (e.g. secret menu unlocked)">
                  <input className={input} value={l.perk ?? ""} onChange={(e) => setLevel(i, { perk: e.target.value || undefined })} />
                </Field>
                {l.reward && (
                  <>
                    <Field label="Menu price (what the customer saves)"><Money value={l.reward.valueCents} onChange={(v) => setLevel(i, { reward: { ...l.reward!, valueCents: v } })} /></Field>
                    <Field label="Ingredient cost to you"><Money value={l.reward.costCents} onChange={(v) => setLevel(i, { reward: { ...l.reward!, costCents: v } })} /></Field>
                  </>
                )}
                <button type="button" className="text-left text-sm text-red-300" onClick={() => setP({ ...p, levels: p.levels.filter((_, j) => j !== i) })}>
                  Remove level
                </button>
              </>
            )}
          </div>
        ))}
        <button
          type="button"
          className="rounded-lg bg-brand-bg px-4 py-2"
          onClick={() => {
            const last = p.levels[p.levels.length - 1];
            setP({ ...p, levels: [...p.levels, { key: `level${Date.now()}`, name: "New level", minVisits: last.minVisits + 5 }] });
          }}
        >
          + Add level
        </button>
      </Section>

      <Section title="Other rewards">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 sm:col-span-2"><input type="checkbox" checked={welcome.enabled} onChange={(e) => setP({ ...p, welcomeReward: { ...welcome, enabled: e.target.checked } })} /> Welcome reward on 2nd visit</label>
          <Field label="Name"><input className={input} value={welcome.name} onChange={(e) => setP({ ...p, welcomeReward: { ...welcome, name: e.target.value } })} /></Field>
          <Field label="Value / cost"><div className="flex gap-2"><Money value={welcome.valueCents} onChange={(v) => setP({ ...p, welcomeReward: { ...welcome, valueCents: v } })} /><Money value={welcome.costCents} onChange={(v) => setP({ ...p, welcomeReward: { ...welcome, costCents: v } })} /></div></Field>
        </div>
        <div className="grid gap-3 border-t border-brand-text/10 pt-4 sm:grid-cols-2">
          <label className="flex items-center gap-2 sm:col-span-2"><input type="checkbox" checked={surprise.enabled} onChange={(e) => setP({ ...p, surpriseReward: { ...surprise, enabled: e.target.checked } })} /> Random surprise rewards</label>
          <Field label="How often (1 in every … visits)">
            <input type="number" min={1} className={input} value={Math.round(1 / Math.max(surprise.chance, 0.0001))} onChange={(e) => setP({ ...p, surpriseReward: { ...surprise, chance: 1 / Math.max(1, Number(e.target.value)) } })} />
          </Field>
          <Field label="Name"><input className={input} value={surprise.name} onChange={(e) => setP({ ...p, surpriseReward: { ...surprise, name: e.target.value } })} /></Field>
          <Field label="Value / cost"><div className="flex gap-2"><Money value={surprise.valueCents} onChange={(v) => setP({ ...p, surpriseReward: { ...surprise, valueCents: v } })} /><Money value={surprise.costCents} onChange={(v) => setP({ ...p, surpriseReward: { ...surprise, costCents: v } })} /></div></Field>
        </div>
        <div className="grid gap-3 border-t border-brand-text/10 pt-4 sm:grid-cols-2">
          <label className="flex items-center gap-2 sm:col-span-2"><input type="checkbox" checked={birthday.enabled} onChange={(e) => setP({ ...p, birthdayReward: { ...birthday, enabled: e.target.checked } })} /> Birthday reward</label>
          <Field label="Name"><input className={input} value={birthday.name} onChange={(e) => setP({ ...p, birthdayReward: { ...birthday, name: e.target.value } })} /></Field>
          <Field label="Value / cost"><div className="flex gap-2"><Money value={birthday.valueCents} onChange={(v) => setP({ ...p, birthdayReward: { ...birthday, valueCents: v } })} /><Money value={birthday.costCents} onChange={(v) => setP({ ...p, birthdayReward: { ...birthday, costCents: v } })} /></div></Field>
        </div>
        <div className="grid gap-3 border-t border-brand-text/10 pt-4 sm:grid-cols-2">
          <Field label="Monthly leaderboard prize"><input className={input} value={p.leaderboardPrize ?? ""} onChange={(e) => setP({ ...p, leaderboardPrize: e.target.value || undefined })} /></Field>
          <Field label="Prize value / cost"><div className="flex gap-2"><Money value={p.leaderboardPrizeValueCents} onChange={(v) => setP({ ...p, leaderboardPrizeValueCents: v })} /><Money value={p.leaderboardPrizeCostCents} onChange={(v) => setP({ ...p, leaderboardPrizeCostCents: v })} /></div></Field>
        </div>
      </Section>

      <Section title="Rules">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Visits needed each week"><input type="number" min={1} className={input} value={p.visitsPerWeek} onChange={(e) => setP({ ...p, visitsPerWeek: Math.max(1, Number(e.target.value)) })} /></Field>
          <Field label="Streak savers per month"><input type="number" min={0} className={input} value={p.saversPerMonth} onChange={(e) => setP({ ...p, saversPerMonth: Math.max(0, Number(e.target.value)) })} /></Field>
          <Field label="Hours between check-ins (anti-cheat)"><input type="number" min={0} step={0.5} className={input} value={p.cooldownMinutes / 60} onChange={(e) => setP({ ...p, cooldownMinutes: Math.round(Number(e.target.value) * 60) })} /></Field>
          <Field label="Average order size (for the profit view)"><Money value={p.averageTicketCents} onChange={(v) => setP({ ...p, averageTicketCents: v })} /></Field>
          <label className="flex items-center gap-2 sm:col-span-2"><input type="checkbox" checked={p.smsRemindersEnabled} onChange={(e) => setP({ ...p, smsRemindersEnabled: e.target.checked })} /> Send “streak ends tomorrow” texts (only to customers who agreed)</label>
        </div>
      </Section>

      <Section title="Look">
        <div className="grid gap-3 sm:grid-cols-3">
          {(Object.keys(brand.colors) as (keyof Brand["colors"])[]).map((k) => (
            <Field key={k} label={k.replace(/([A-Z])/g, " $1").toLowerCase()}>
              <div className="flex gap-2">
                <input type="color" value={brand.colors[k]} onChange={(e) => setBrand({ ...brand, colors: { ...brand.colors, [k]: e.target.value } })} className="h-10 w-12 rounded" />
                <input className={input} value={brand.colors[k]} onChange={(e) => setBrand({ ...brand, colors: { ...brand.colors, [k]: e.target.value } })} />
              </div>
            </Field>
          ))}
        </div>
        <Field label="Logo URL" hint="Upload the logo anywhere public (or into public/cafes/<slug>/) and paste its address.">
          <input className={input} value={brand.logoUrl ?? ""} onChange={(e) => setBrand({ ...brand, logoUrl: e.target.value || null })} />
        </Field>
        <Field label="Tagline on the counter screen"><input className={input} value={brand.tagline ?? ""} onChange={(e) => setBrand({ ...brand, tagline: e.target.value || undefined })} /></Field>
      </Section>

      <div className="sticky bottom-4 flex items-center gap-4 rounded-2xl bg-brand-surface p-4 shadow-xl">
        <button disabled={pending} className="rounded-xl bg-brand-primary px-6 py-3 font-semibold text-brand-on-primary disabled:opacity-50">{pending ? "Saving…" : "Save changes"}</button>
        {msg && <p className={msg.ok ? "text-brand-primary" : "text-red-300"}>{msg.message}</p>}
      </div>
    </form>
  );
}
