"use client";
/**
 * OWNER SETTINGS: every game rule is editable here, no code needed.
 * Money is typed in dollars and stored as cents. The server validates
 * everything again before saving.
 */
import { Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import type { Brand } from "@/lib/brand";
import type { Badge, BadgeRule, CafeEvent, Challenge, Level, MenuCategory, MenuItem, MysteryPrize, Program, RewardSpec } from "@/lib/program";

const input = "w-full rounded-lg bg-brand-bg px-3 py-2 outline-none ring-brand-primary focus:ring-2";
const uid = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 7)}`;

function Field({ label, children, hint, className = "" }: { label: string; children: React.ReactNode; hint?: string; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-xs text-brand-muted">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-brand-muted/80">{hint}</span>}
    </label>
  );
}

function Money({ value, onChange }: { value: number; onChange: (cents: number) => void }) {
  const [text, setText] = useState((value / 100).toFixed(2));
  return (
    <div className="flex items-center gap-1">
      <span className="text-brand-muted">$</span>
      <input
        inputMode="decimal"
        className={input}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(Math.max(0, Math.round(Number(e.target.value || 0) * 100)));
        }}
      />
    </div>
  );
}

function Num({ value, onChange, min = 0, step = 1 }: { value: number; onChange: (n: number) => void; min?: number; step?: number }) {
  return <input type="number" min={min} step={step} className={input} value={Number.isFinite(value) ? value : 0} onChange={(e) => onChange(Number(e.target.value))} />;
}

function Text({ value, onChange, placeholder }: { value: string; onChange: (s: string) => void; placeholder?: string }) {
  return <input className={input} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />;
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" className="h-5 w-5 accent-[var(--brand-primary)]" checked={checked} onChange={(e) => onChange(e.target.checked)} /> {label}
    </label>
  );
}

/** Optional reward: name + menu price + ingredient cost. */
function RewardEditor({ value, onChange, label = "Reward (optional)" }: { value?: RewardSpec; onChange: (r?: RewardSpec) => void; label?: string }) {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      <Field label={label}>
        <Text value={value?.name ?? ""} placeholder="e.g. Free pastry" onChange={(n) => onChange(n ? { valueCents: 0, costCents: 0, ...value, name: n } : undefined)} />
      </Field>
      {value && (
        <>
          <Field label="Menu price (customer saves)">
            <Money value={value.valueCents} onChange={(v) => onChange({ ...value, valueCents: v })} />
          </Field>
          <Field label="Ingredient cost (to you)">
            <Money value={value.costCents} onChange={(v) => onChange({ ...value, costCents: v })} />
          </Field>
        </>
      )}
    </div>
  );
}

function Card({ children, onDelete }: { children: React.ReactNode; onDelete?: () => void }) {
  return (
    <div className="relative space-y-3 rounded-xl border border-brand-text/10 p-4">
      {onDelete && (
        <button type="button" onClick={onDelete} className="absolute right-3 top-3 text-brand-muted hover:text-red-400" aria-label="Remove">
          <Trash2 className="h-4 w-4" />
        </button>
      )}
      {children}
    </div>
  );
}

function AddButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="pressable flex items-center gap-1.5 rounded-lg bg-brand-bg px-4 py-2 text-sm">
      <Plus className="h-4 w-4" /> {children}
    </button>
  );
}

const SECTIONS = ["Levels & XP", "Badges", "Menu & passport", "Challenges", "Events", "Mystery dallah", "Streak & social", "Look"] as const;
type Section = (typeof SECTIONS)[number];
/** Parts only Streakify (the admin) can change. Owners see a note instead. */
const ADMIN_ONLY: Section[] = ["Menu & passport", "Look"];

export type SaveResult = { ok: boolean; message: string };

export function SettingsForm({
  program: initial,
  brand: initialBrand,
  mode,
  save,
}: {
  program: Program;
  brand: Brand;
  mode: "owner" | "admin";
  save: (program: Program, brand: Brand) => Promise<SaveResult>;
}) {
  const sections = mode === "admin" ? SECTIONS : SECTIONS.filter((x) => !ADMIN_ONLY.includes(x));
  const [p, setP] = useState<Program>(initial);
  const [brand, setBrand] = useState<Brand>(initialBrand);
  const [section, setSection] = useState<Section>("Levels & XP");
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  const up = (patch: Partial<Program>) => setP((x) => ({ ...x, ...patch }));
  const listOps = <K extends "levels" | "badges" | "events" | "challenges">(key: K) => ({
    set: (i: number, patch: Partial<Program[K][number]>) => up({ [key]: (p[key] as Program[K][number][]).map((x, j) => (j === i ? { ...x, ...patch } : x)) } as Partial<Program>),
    remove: (i: number) => up({ [key]: (p[key] as Program[K][number][]).filter((_, j) => j !== i) } as Partial<Program>),
  });
  const levels = listOps("levels");
  const badges = listOps("badges");
  const events = listOps("events");
  const challenges = listOps("challenges");
  const menu = p.menu;
  const setMenu = (m: Partial<Program["menu"]>) => up({ menu: { ...menu, ...m } });
  const totalWeight = p.mystery.prizes.reduce((a, x) => a + x.weight, 0) || 1;

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => setMsg(await save(p, brand)));
      }}
    >
      <div className="glass sticky top-0 z-10 -mx-4 overflow-x-auto px-4 py-2" data-no-swipe>
        <div className="flex w-max gap-1 rounded-xl bg-brand-surface p-1">
          {sections.map((s) => (
            <button key={s} type="button" onClick={() => setSection(s)} className={`rounded-lg px-3 py-1.5 text-sm whitespace-nowrap ${section === s ? "bg-brand-primary font-semibold text-brand-on-primary" : "text-brand-muted"}`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {mode === "owner" && (
        <p className="rounded-2xl bg-brand-surface p-4 text-sm text-brand-muted">
          Your logo, colors, menu, subdomain, plan and the &ldquo;Powered by Streakify&rdquo; line are managed by Streakify.{" "}
          <strong className="text-brand-text">Contact Streakify to change these.</strong>
        </p>
      )}
      <section className="card space-y-4 p-5">
        {section === "Levels & XP" && (
          <>
            <h2 className="text-lg font-semibold">How customers earn XP</h2>
            <div className="grid gap-3 sm:grid-cols-4">
              <Field label="XP per check-in"><Num value={p.xp.perVisit} onChange={(v) => up({ xp: { ...p.xp, perVisit: v } })} /></Field>
              <Field label="Bonus XP per streak week"><Num value={p.xp.perStreakWeek} onChange={(v) => up({ xp: { ...p.xp, perStreakWeek: v } })} /></Field>
              <Field label="Max streak bonus"><Num value={p.xp.streakBonusCap} onChange={(v) => up({ xp: { ...p.xp, streakBonusCap: v } })} /></Field>
              <Field label="XP for a new drink"><Num value={p.xp.newItem} onChange={(v) => up({ xp: { ...p.xp, newItem: v } })} /></Field>
            </div>
            <h2 className="pt-2 text-lg font-semibold">Levels</h2>
            <p className="text-sm text-brand-muted">Missing a week (with no streak saver left) drops a customer one level. Earned rewards and badges are kept.</p>
            {p.levels.map((l: Level, i) => (
              <Card key={i} onDelete={i > 0 ? () => levels.remove(i) : undefined}>
                <div className="grid gap-3 sm:grid-cols-[70px_1fr_140px]">
                  <Field label="Icon"><Text value={l.icon} onChange={(v) => levels.set(i, { icon: v })} /></Field>
                  <Field label="Level name"><Text value={l.name} onChange={(v) => levels.set(i, { name: v })} /></Field>
                  <Field label="XP needed">{i === 0 ? <p className="py-2 text-sm text-brand-muted">0 (start)</p> : <Num value={l.minXp} onChange={(v) => levels.set(i, { minXp: v })} />}</Field>
                </div>
                {i > 0 && (
                  <>
                    <RewardEditor value={l.reward} onChange={(r) => levels.set(i, { reward: r })} label="Reward when reached" />
                    <Field label="Perk at this level (e.g. secret menu unlocked)"><Text value={l.perk ?? ""} onChange={(v) => levels.set(i, { perk: v || undefined })} /></Field>
                  </>
                )}
              </Card>
            ))}
            <AddButton onClick={() => up({ levels: [...p.levels, { key: uid("level"), name: "New level", icon: "⭐", minXp: p.levels[p.levels.length - 1].minXp + 800 }] })}>Add level</AddButton>
          </>
        )}

        {section === "Badges" && (
          <>
            <h2 className="text-lg font-semibold">Badges</h2>
            <p className="text-sm text-brand-muted">Collectible achievements. Locked ones show as silhouettes on the customer&apos;s phone.</p>
            {p.badges.map((b: Badge, i) => (
              <Card key={b.key} onDelete={() => badges.remove(i)}>
                <div className="grid gap-3 sm:grid-cols-[70px_1fr_1fr_100px]">
                  <Field label="Icon"><Text value={b.icon} onChange={(v) => badges.set(i, { icon: v })} /></Field>
                  <Field label="Name"><Text value={b.name} onChange={(v) => badges.set(i, { name: v })} /></Field>
                  <Field label="Description"><Text value={b.description} onChange={(v) => badges.set(i, { description: v })} /></Field>
                  <Field label="Bonus XP"><Num value={b.xp} onChange={(v) => badges.set(i, { xp: v })} /></Field>
                </div>
                <RuleEditor rule={b.rule} program={p} onChange={(rule) => badges.set(i, { rule })} />
              </Card>
            ))}
            <AddButton onClick={() => up({ badges: [...p.badges, { key: uid("badge"), name: "New badge", description: "", icon: "🏅", xp: 50, rule: { type: "total_visits", count: 10 } }] })}>Create custom badge</AddButton>
          </>
        )}

        {section === "Menu & passport" && (
          <>
            <h2 className="text-lg font-semibold">Passport pages (categories)</h2>
            <p className="text-sm text-brand-muted">Each new drink a customer tries is a stamp. Completing a page gives its reward.</p>
            {menu.categories.map((c: MenuCategory, i) => (
              <Card key={c.id} onDelete={() => setMenu({ categories: menu.categories.filter((_, j) => j !== i), items: menu.items.filter((it) => it.categoryId !== c.id) })}>
                <div className="grid gap-3 sm:grid-cols-[70px_1fr]">
                  <Field label="Icon"><Text value={c.icon} onChange={(v) => setMenu({ categories: menu.categories.map((x, j) => (j === i ? { ...x, icon: v } : x)) })} /></Field>
                  <Field label="Page name"><Text value={c.name} onChange={(v) => setMenu({ categories: menu.categories.map((x, j) => (j === i ? { ...x, name: v } : x)) })} /></Field>
                </div>
                <RewardEditor value={c.reward} onChange={(r) => setMenu({ categories: menu.categories.map((x, j) => (j === i ? { ...x, reward: r } : x)) })} label="Reward for completing the page" />
              </Card>
            ))}
            <AddButton onClick={() => setMenu({ categories: [...menu.categories, { id: uid("cat"), name: "New page", icon: "☕" }] })}>Add page</AddButton>
            <h2 className="pt-2 text-lg font-semibold">Menu items</h2>
            {menu.items.map((it: MenuItem, i) => (
              <div key={it.id} className="grid items-end gap-2 sm:grid-cols-[70px_1fr_1fr_32px]">
                <Field label="Icon"><Text value={it.icon} onChange={(v) => setMenu({ items: menu.items.map((x, j) => (j === i ? { ...x, icon: v } : x)) })} /></Field>
                <Field label="Name"><Text value={it.name} onChange={(v) => setMenu({ items: menu.items.map((x, j) => (j === i ? { ...x, name: v } : x)) })} /></Field>
                <Field label="Page">
                  <select className={input} value={it.categoryId} onChange={(e) => setMenu({ items: menu.items.map((x, j) => (j === i ? { ...x, categoryId: e.target.value } : x)) })}>
                    {menu.categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <button type="button" onClick={() => setMenu({ items: menu.items.filter((_, j) => j !== i) })} className="pb-2 text-brand-muted hover:text-red-400" aria-label="Remove item">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            {menu.categories.length > 0 && (
              <AddButton onClick={() => setMenu({ items: [...menu.items, { id: uid("item"), name: "New drink", icon: "☕", categoryId: menu.categories[0].id, priceCents: 0, costCents: 0 }] })}>Add menu item</AddButton>
            )}
          </>
        )}

        {section === "Challenges" && (
          <>
            <h2 className="text-lg font-semibold">Challenges</h2>
            <p className="text-sm text-brand-muted">Weekly ones reset every week. Event challenges run during an event. “Once” challenges can be done one time.</p>
            {p.challenges.map((c: Challenge, i) => (
              <Card key={c.id} onDelete={() => challenges.remove(i)}>
                <div className="grid gap-3 sm:grid-cols-[70px_1fr_140px_100px]">
                  <Field label="Icon"><Text value={c.icon} onChange={(v) => challenges.set(i, { icon: v })} /></Field>
                  <Field label="Title"><Text value={c.title} onChange={(v) => challenges.set(i, { title: v })} /></Field>
                  <Field label="Runs">
                    <select className={input} value={c.period} onChange={(e) => challenges.set(i, { period: e.target.value as Challenge["period"] })}>
                      <option value="weekly">Every week</option>
                      <option value="event">During an event</option>
                      <option value="once">Once</option>
                    </select>
                  </Field>
                  <Field label="Bonus XP"><Num value={c.xp} onChange={(v) => challenges.set(i, { xp: v })} /></Field>
                </div>
                {c.period === "event" && (
                  <Field label="Event">
                    <select className={input} value={c.eventId ?? ""} onChange={(e) => challenges.set(i, { eventId: e.target.value })}>
                      <option value="">Choose…</option>
                      {p.events.map((ev) => (
                        <option key={ev.id} value={ev.id}>
                          {ev.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
                <GoalEditor goal={c.goal} program={p} onChange={(goal) => challenges.set(i, { goal })} />
                <RewardEditor value={c.reward} onChange={(r) => challenges.set(i, { reward: r })} />
                <Toggle checked={c.active} onChange={(v) => challenges.set(i, { active: v })} label="Active" />
              </Card>
            ))}
            <AddButton onClick={() => up({ challenges: [...p.challenges, { id: uid("ch"), title: "Visit 2 times this week", icon: "🎯", period: "weekly", goal: { type: "visits", count: 2 }, xp: 100, active: true }] })}>
              Add challenge
            </AddButton>
          </>
        )}

        {section === "Events" && (
          <>
            <h2 className="text-lg font-semibold">Limited-time events</h2>
            <p className="text-sm text-brand-muted">Multiply XP during a date range, optionally only during certain hours (e.g. Ramadan after iftar, 18 to 24).</p>
            {p.events.map((ev: CafeEvent, i) => (
              <Card key={ev.id} onDelete={() => events.remove(i)}>
                <div className="grid gap-3 sm:grid-cols-[70px_1fr_1fr]">
                  <Field label="Icon"><Text value={ev.icon} onChange={(v) => events.set(i, { icon: v })} /></Field>
                  <Field label="Name"><Text value={ev.name} onChange={(v) => events.set(i, { name: v })} /></Field>
                  <Field label="Description"><Text value={ev.description} onChange={(v) => events.set(i, { description: v })} /></Field>
                </div>
                <div className="grid gap-3 sm:grid-cols-5">
                  <Field label="Starts"><input type="date" className={input} value={ev.start} onChange={(e) => events.set(i, { start: e.target.value })} /></Field>
                  <Field label="Ends"><input type="date" className={input} value={ev.end} onChange={(e) => events.set(i, { end: e.target.value })} /></Field>
                  <Field label="XP multiplier"><Num value={ev.xpMultiplier} step={0.5} min={1} onChange={(v) => events.set(i, { xpMultiplier: v })} /></Field>
                  <Field label="From hour (opt.)"><input type="number" min={0} max={23} className={input} value={ev.fromHour ?? ""} onChange={(e) => events.set(i, { fromHour: e.target.value === "" ? undefined : Number(e.target.value) })} /></Field>
                  <Field label="To hour (opt.)"><input type="number" min={1} max={24} className={input} value={ev.toHour ?? ""} onChange={(e) => events.set(i, { toHour: e.target.value === "" ? undefined : Number(e.target.value) })} /></Field>
                </div>
              </Card>
            ))}
            <AddButton onClick={() => up({ events: [...p.events, { id: uid("event"), name: "New event", icon: "✨", description: "", start: new Date().toISOString().slice(0, 10), end: new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10), xpMultiplier: 2 }] })}>
              Add event
            </AddButton>
          </>
        )}

        {section === "Mystery dallah" && (
          <>
            <h2 className="text-lg font-semibold">Mystery dallah</h2>
            <p className="text-sm text-brand-muted">
              Customers earn a dallah to open on their phone. Prizes that cost you money stop once this month&apos;s budget is used up; XP prizes always stay available, so you never overspend.
            </p>
            <Toggle checked={p.mystery.enabled} onChange={(v) => up({ mystery: { ...p.mystery, enabled: v } })} label="Mystery dallahs on" />
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Every Nth visit (0 = off)"><Num value={p.mystery.everyNthVisit} onChange={(v) => up({ mystery: { ...p.mystery, everyNthVisit: v } })} /></Field>
              <Field label="Extra random chance per visit (%)"><Num value={Math.round(p.mystery.chance * 1000) / 10} step={0.5} onChange={(v) => up({ mystery: { ...p.mystery, chance: Math.min(100, v) / 100 } })} /></Field>
              <Field label="Monthly prize budget (ingredient cost)"><Money value={p.mystery.monthlyBudgetCents} onChange={(v) => up({ mystery: { ...p.mystery, monthlyBudgetCents: v } })} /></Field>
            </div>
            {p.mystery.prizes.map((pr: MysteryPrize, i) => (
              <Card key={pr.id} onDelete={() => up({ mystery: { ...p.mystery, prizes: p.mystery.prizes.filter((_, j) => j !== i) } })}>
                <div className="grid gap-3 sm:grid-cols-[70px_1fr_90px_90px]">
                  <Field label="Icon"><Text value={pr.icon} onChange={(v) => up({ mystery: { ...p.mystery, prizes: p.mystery.prizes.map((x, j) => (j === i ? { ...x, icon: v } : x)) } })} /></Field>
                  <Field label="Prize"><Text value={pr.name} onChange={(v) => up({ mystery: { ...p.mystery, prizes: p.mystery.prizes.map((x, j) => (j === i ? { ...x, name: v } : x)) } })} /></Field>
                  <Field label="Weight" hint={`${Math.round((pr.weight / totalWeight) * 1000) / 10}% odds`}>
                    <Num value={pr.weight} onChange={(v) => up({ mystery: { ...p.mystery, prizes: p.mystery.prizes.map((x, j) => (j === i ? { ...x, weight: v } : x)) } })} />
                  </Field>
                  <Field label="Bonus XP"><Num value={pr.xp} onChange={(v) => up({ mystery: { ...p.mystery, prizes: p.mystery.prizes.map((x, j) => (j === i ? { ...x, xp: v } : x)) } })} /></Field>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Menu price (0 for XP-only)"><Money value={pr.valueCents} onChange={(v) => up({ mystery: { ...p.mystery, prizes: p.mystery.prizes.map((x, j) => (j === i ? { ...x, valueCents: v } : x)) } })} /></Field>
                  <Field label="Ingredient cost"><Money value={pr.costCents} onChange={(v) => up({ mystery: { ...p.mystery, prizes: p.mystery.prizes.map((x, j) => (j === i ? { ...x, costCents: v } : x)) } })} /></Field>
                </div>
              </Card>
            ))}
            <AddButton onClick={() => up({ mystery: { ...p.mystery, prizes: [...p.mystery.prizes, { id: uid("prize"), name: "+100 bonus XP", icon: "⚡", weight: 10, valueCents: 0, costCents: 0, xp: 100 }] } })}>Add prize</AddButton>
          </>
        )}

        {section === "Streak & social" && (
          <>
            <h2 className="text-lg font-semibold">Streak rules</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Visits needed each week"><Num value={p.visitsPerWeek} min={1} onChange={(v) => up({ visitsPerWeek: Math.max(1, v) })} /></Field>
              <Field label="Streak savers per month"><Num value={p.saversPerMonth} onChange={(v) => up({ saversPerMonth: v })} /></Field>
              <Field label="Hours between check-ins (anti-cheat)"><Num value={p.cooldownMinutes / 60} step={0.5} onChange={(v) => up({ cooldownMinutes: Math.round(v * 60) })} /></Field>
            </div>
            <h3 className="pt-2 font-semibold">Streak milestones</h3>
            {p.milestones.map((m, i) => (
              <Card key={i} onDelete={() => up({ milestones: p.milestones.filter((_, j) => j !== i) })}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Weeks"><Num value={m.weeks} min={1} onChange={(v) => up({ milestones: p.milestones.map((x, j) => (j === i ? { ...x, weeks: v } : x)) })} /></Field>
                  <Field label="Bonus XP"><Num value={m.xp} onChange={(v) => up({ milestones: p.milestones.map((x, j) => (j === i ? { ...x, xp: v } : x)) })} /></Field>
                </div>
                <RewardEditor value={m.reward} onChange={(r) => up({ milestones: p.milestones.map((x, j) => (j === i ? { ...x, reward: r } : x)) })} />
              </Card>
            ))}
            <AddButton onClick={() => up({ milestones: [...p.milestones, { weeks: 16, xp: 300 }] })}>Add milestone</AddButton>

            <h3 className="pt-2 font-semibold">Welcome & birthday</h3>
            <Toggle checked={Boolean(p.welcomeReward?.enabled)} onChange={(v) => up({ welcomeReward: { name: "$1.50 off", valueCents: 150, costCents: 150, onVisit: 2, ...p.welcomeReward, enabled: v } })} label="Reward on the 2nd visit" />
            {p.welcomeReward?.enabled && <RewardEditor value={p.welcomeReward} onChange={(r) => r && up({ welcomeReward: { ...p.welcomeReward!, ...r } })} label="Welcome reward" />}
            <Toggle checked={Boolean(p.birthdayReward?.enabled)} onChange={(v) => up({ birthdayReward: { name: "Free birthday drink", valueCents: 600, costCents: 150, windowDays: 7, ...p.birthdayReward, enabled: v } })} label="Birthday reward" />
            {p.birthdayReward?.enabled && <RewardEditor value={p.birthdayReward} onChange={(r) => r && up({ birthdayReward: { ...p.birthdayReward!, ...r } })} label="Birthday reward" />}

            <h3 className="pt-2 font-semibold">Friends</h3>
            <Toggle checked={p.referral.enabled} onChange={(v) => up({ referral: { ...p.referral, enabled: v } })} label="Refer a friend" />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Bonus XP for both"><Num value={p.referral.xp} onChange={(v) => up({ referral: { ...p.referral, xp: v } })} /></Field>
              <Field label="Max rewarded referrals per person per month"><Num value={p.referral.maxPerMonth} onChange={(v) => up({ referral: { ...p.referral, maxPerMonth: v } })} /></Field>
            </div>
            <Toggle checked={p.squads.enabled} onChange={(v) => up({ squads: { ...p.squads, enabled: v } })} label="Squads (group streaks)" />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Max squad size"><Num value={p.squads.maxMembers} min={2} onChange={(v) => up({ squads: { ...p.squads, maxMembers: Math.max(2, v) } })} /></Field>
              <Field label="XP each when the whole squad visits in a week"><Num value={p.squads.xpPerWeek} onChange={(v) => up({ squads: { ...p.squads, xpPerWeek: v } })} /></Field>
            </div>

            <h3 className="pt-2 font-semibold">Leaderboard & reports</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Monthly #1 prize"><Text value={p.leaderboardPrize ?? ""} onChange={(v) => up({ leaderboardPrize: v || undefined })} /></Field>
              <Field label="Prize value"><Money value={p.leaderboardPrizeValueCents} onChange={(v) => up({ leaderboardPrizeValueCents: v })} /></Field>
              <Field label="Prize cost"><Money value={p.leaderboardPrizeCostCents} onChange={(v) => up({ leaderboardPrizeCostCents: v })} /></Field>
              <Field label="Average order (profit view)"><Money value={p.averageTicketCents} onChange={(v) => up({ averageTicketCents: v })} /></Field>
            </div>
            <Toggle checked={p.smsRemindersEnabled} onChange={(v) => up({ smsRemindersEnabled: v })} label="“Streak ends tomorrow” reminders (only to customers who agreed)" />
          </>
        )}

        {section === "Look" && (
          <>
            <h2 className="text-lg font-semibold">Look</h2>
            <p className="text-sm text-brand-muted">Pick your dark-mode colors. A matching light mode is created automatically for phones in light mode.</p>
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
            <Field label="Logo URL" hint="Upload your logo anywhere public (or into public/cafes/<slug>/) and paste its address. It's also used for the app icon and Wallet pass.">
              <Text value={brand.logoUrl ?? ""} onChange={(v) => setBrand({ ...brand, logoUrl: v || null })} />
            </Field>
            <Field label="Tagline on the counter screen"><Text value={brand.tagline ?? ""} onChange={(v) => setBrand({ ...brand, tagline: v || undefined })} /></Field>
          </>
        )}
      </section>

      <div className="glass-surface sticky bottom-4 flex items-center gap-4 rounded-2xl p-4 shadow-xl">
        <button disabled={pending} className="pressable rounded-xl bg-brand-primary px-6 py-3 font-semibold text-brand-on-primary disabled:opacity-50">
          {pending ? "Saving…" : "Save all changes"}
        </button>
        {msg && <p className={msg.ok ? "text-brand-primary" : "text-red-400"}>{msg.message}</p>}
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------

const RULE_LABELS: Record<BadgeRule["type"], string> = {
  visit_before_hour: "Check in before an hour",
  visit_after_hour: "Check in after an hour",
  streak_weeks: "Reach a streak length",
  total_visits: "Total visits",
  distinct_items: "Try N different menu items",
  category_complete: "Complete a passport page",
  referrals: "Bring N friends",
  event_visits: "Visits during an event",
  perfect_month: "Perfect month (every week)",
  level_reached: "Reach a level",
  squad_weeks: "Squad streak length",
};

function defaultRule(type: BadgeRule["type"], p: Program): BadgeRule {
  switch (type) {
    case "visit_before_hour":
      return { type, hour: 9 };
    case "visit_after_hour":
      return { type, hour: 20 };
    case "streak_weeks":
      return { type, weeks: 4 };
    case "total_visits":
      return { type, count: 10 };
    case "distinct_items":
      return { type, count: 5 };
    case "category_complete":
      return { type, categoryId: p.menu.categories[0]?.id ?? "" };
    case "referrals":
      return { type, count: 1 };
    case "event_visits":
      return { type, eventId: p.events[0]?.id ?? "", count: 5 };
    case "perfect_month":
      return { type };
    case "level_reached":
      return { type, levelKey: p.levels[p.levels.length - 1].key };
    case "squad_weeks":
      return { type, weeks: 4 };
  }
}

function RuleEditor({ rule, program: p, onChange }: { rule: BadgeRule; program: Program; onChange: (r: BadgeRule) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Unlocked when">
        <select className={input} value={rule.type} onChange={(e) => onChange(defaultRule(e.target.value as BadgeRule["type"], p))}>
          {Object.entries(RULE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </Field>
      {(rule.type === "visit_before_hour" || rule.type === "visit_after_hour") && (
        <Field label="Hour (0-23, café time)"><Num value={rule.hour} onChange={(v) => onChange({ ...rule, hour: Math.min(23, Math.max(0, v)) })} /></Field>
      )}
      {(rule.type === "streak_weeks" || rule.type === "squad_weeks") && <Field label="Weeks"><Num value={rule.weeks} min={1} onChange={(v) => onChange({ ...rule, weeks: v })} /></Field>}
      {(rule.type === "total_visits" || rule.type === "distinct_items" || rule.type === "referrals") && <Field label="How many"><Num value={rule.count} min={1} onChange={(v) => onChange({ ...rule, count: v })} /></Field>}
      {rule.type === "category_complete" && (
        <Field label="Passport page">
          <select className={input} value={rule.categoryId} onChange={(e) => onChange({ ...rule, categoryId: e.target.value })}>
            {p.menu.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      {rule.type === "event_visits" && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Event">
            <select className={input} value={rule.eventId} onChange={(e) => onChange({ ...rule, eventId: e.target.value })}>
              {p.events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Visits"><Num value={rule.count} min={1} onChange={(v) => onChange({ ...rule, count: v })} /></Field>
        </div>
      )}
      {rule.type === "level_reached" && (
        <Field label="Level">
          <select className={input} value={rule.levelKey} onChange={(e) => onChange({ ...rule, levelKey: e.target.value })}>
            {p.levels.map((l) => (
              <option key={l.key} value={l.key}>
                {l.name}
              </option>
            ))}
          </select>
        </Field>
      )}
    </div>
  );
}

function GoalEditor({ goal, program: p, onChange }: { goal: Challenge["goal"]; program: Program; onChange: (g: Challenge["goal"]) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Goal">
        <select
          className={input}
          value={goal.type}
          onChange={(e) => {
            const t = e.target.value as Challenge["goal"]["type"];
            onChange(
              t === "visits"
                ? { type: t, count: 3 }
                : t === "try_category"
                  ? { type: t, categoryId: p.menu.categories[0]?.id ?? "", count: 1 }
                  : t === "try_item"
                    ? { type: t, itemId: p.menu.items[0]?.id ?? "" }
                    : { type: t, count: 1 },
            );
          }}
        >
          <option value="visits">Visit N times</option>
          <option value="try_category">Order from a menu page</option>
          <option value="try_item">Order a specific item</option>
          <option value="try_new">Try N new items</option>
        </select>
      </Field>
      {(goal.type === "visits" || goal.type === "try_new") && <Field label="How many"><Num value={goal.count} min={1} onChange={(v) => onChange({ ...goal, count: v })} /></Field>}
      {goal.type === "try_category" && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Page">
            <select className={input} value={goal.categoryId} onChange={(e) => onChange({ ...goal, categoryId: e.target.value })}>
              {p.menu.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Different items"><Num value={goal.count} min={1} onChange={(v) => onChange({ ...goal, count: v })} /></Field>
        </div>
      )}
      {goal.type === "try_item" && (
        <Field label="Item">
          <select className={input} value={goal.itemId} onChange={(e) => onChange({ ...goal, itemId: e.target.value })}>
            {p.menu.items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </Field>
      )}
    </div>
  );
}

