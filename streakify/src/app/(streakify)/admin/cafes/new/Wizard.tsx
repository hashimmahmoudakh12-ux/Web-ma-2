"use client";
/**
 * ADD A CAFÉ in 7 steps:
 *  1 details  2 logo & colors  3 subdomain  4 menu  5 levels & rewards
 *  6 Toast discount buttons  7 plan & demo  ->  creates café + invites owner
 */
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { contrast, mix, readableOn } from "@/lib/color";
import type { Program, RewardSpec } from "@/lib/program";
import { checkSlugAction, createCafeAction } from "../../actions";
import { Msg, btn, btn2, input } from "../../AdminWidgets";

type Colors = { background: string; surface: string; primary: string; onPrimary: string; text: string; muted: string };
export type Template = { id: string; label: string; program: Program; colors: Colors | null; timezone?: string };

const STEPS = ["Details", "Logo & colors", "Subdomain", "Menu", "Levels & rewards", "Toast buttons", "Plan"];
const ZONES = ["America/New_York", "America/Detroit", "America/Chicago", "America/Denver", "America/Phoenix", "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu", "Europe/London", "Asia/Aden"];
const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 7)}`;
const dollars = (c: number) => (c / 100).toFixed(2);
const cents = (s: string) => Math.max(0, Math.round(Number(s || 0) * 100));

/** Full palette from one brand color (dark theme; light theme is derived automatically). */
function paletteFrom(primary: string, background?: string): Colors {
  const bg = background ?? mix(primary, "#0b0705", 0.88);
  const text = contrast("#ffffff", bg) > 7 ? "#f6efe6" : "#16100b";
  return { background: bg, surface: mix(bg, text, 0.07), primary, onPrimary: readableOn(primary), text, muted: mix(bg, text, 0.6) };
}

/** Shrinks the logo in the browser and finds its main colors. */
async function processLogo(file: File): Promise<{ dataUrl: string; suggestions: string[] }> {
  const url = URL.createObjectURL(file);
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = url;
  });
  const scale = Math.min(1, 320 / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(img.width * scale));
  c.height = Math.max(1, Math.round(img.height * scale));
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, 0, c.width, c.height);
  URL.revokeObjectURL(url);
  const { data } = ctx.getImageData(0, 0, c.width, c.height);
  const buckets = new Map<string, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i < data.length; i += 16) {
    const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
    if (a < 128) continue;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max > 240 && min > 230) continue; // skip white
    if (max < 25) continue; // skip black
    if (max - min < 25) continue; // skip greys
    const key = `${r >> 5}-${g >> 5}-${b >> 5}`;
    const e = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    e.n++;
    e.r += r;
    e.g += g;
    e.b += b;
    buckets.set(key, e);
  }
  const hex = (n: number) => Math.round(n).toString(16).padStart(2, "0");
  const suggestions = [...buckets.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, 4)
    .map((e) => `#${hex(e.r / e.n)}${hex(e.g / e.n)}${hex(e.b / e.n)}`);
  return { dataUrl: c.toDataURL("image/png"), suggestions };
}

export function Wizard({ templates }: { templates: Template[] }) {
  const [step, setStep] = useState(0);
  const [templateId, setTemplateId] = useState(templates[0].id);
  const [d, setD] = useState({ name: "", address: "", ownerName: "", ownerEmail: "", ownerPhone: "", slug: "", timezone: "America/New_York", tagline: "" });
  const [logo, setLogo] = useState<string | null>(null);
  const [suggest, setSuggest] = useState<string[]>([]);
  const [colors, setColors] = useState<Colors>(templates[0].colors ?? paletteFrom("#d4a24c", "#16100b"));
  const [program, setProgram] = useState<Program>(structuredClone(templates[0].program));
  const [plan, setPlan] = useState({ status: "trial" as "trial" | "active", price: "99.00", setupFeePaid: false, demo: false });
  const [slugMsg, setSlugMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Awaited<ReturnType<typeof createCafeAction>> | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof typeof d, v: string) => setD((x) => ({ ...x, [k]: v }));

  const applyTemplate = (id: string) => {
    const t = templates.find((x) => x.id === id)!;
    setTemplateId(id);
    setProgram(structuredClone(t.program));
    if (t.colors) setColors({ ...t.colors });
    if (t.timezone) set("timezone", t.timezone);
  };

  // Every reward in the program, so step 6 can name its Toast button.
  const rewardSlots = useMemo(() => {
    const slots: { label: string; get: (p: Program) => RewardSpec | undefined; put: (p: Program, r: RewardSpec) => void }[] = [];
    program.levels.forEach((l, i) => l.reward && slots.push({ label: `Level ${l.name}: ${l.reward.name}`, get: (p) => p.levels[i].reward, put: (p, r) => (p.levels[i].reward = r) }));
    if (program.welcomeReward?.enabled) slots.push({ label: `Welcome: ${program.welcomeReward.name}`, get: (p) => p.welcomeReward, put: (p, r) => (p.welcomeReward = { ...p.welcomeReward!, ...r }) });
    if (program.birthdayReward?.enabled) slots.push({ label: `Birthday: ${program.birthdayReward.name}`, get: (p) => p.birthdayReward, put: (p, r) => (p.birthdayReward = { ...p.birthdayReward!, ...r }) });
    program.milestones.forEach((m, i) => m.reward && slots.push({ label: `${m.weeks}-week streak: ${m.reward.name}`, get: (p) => p.milestones[i].reward, put: (p, r) => (p.milestones[i].reward = r) }));
    program.menu.categories.forEach((c, i) => c.reward && slots.push({ label: `Passport ${c.name}: ${c.reward.name}`, get: (p) => p.menu.categories[i].reward, put: (p, r) => (p.menu.categories[i].reward = r) }));
    program.challenges.forEach((c, i) => c.reward && slots.push({ label: `Challenge ${c.title}: ${c.reward.name}`, get: (p) => p.challenges[i].reward, put: (p, r) => (p.challenges[i].reward = r) }));
    return slots;
  }, [program]);

  const mutate = (fn: (p: Program) => void) =>
    setProgram((p) => {
      const n = structuredClone(p);
      fn(n);
      return n;
    });

  const canNext = [
    d.name.trim().length > 1 && /\S+@\S+\.\S+/.test(d.ownerEmail),
    true,
    Boolean(slugMsg?.ok),
    program.menu.items.length > 0,
    program.levels.length > 0,
    true,
    true,
  ][step];

  if (done?.ok) {
    return (
      <section className="card max-w-2xl space-y-4 p-6">
        <h2 className="text-2xl font-bold">{d.name} is ready</h2>
        <p>{done.message}</p>
        {done.link && <Msg r={{ ok: true, message: "Owner invite link:", link: done.link }} />}
        <p className="rounded-xl bg-brand-primary/15 p-3">
          Counter PIN: <strong className="font-mono text-lg">{done.pin}</strong> (write it down; you can change it later).
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href={`/admin/cafes/${done.cafeId}`} className={btn}>
            Open café
          </Link>
          <Link href="/admin" className={btn2}>
            All cafés
          </Link>
        </div>
      </section>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
      <ol className="flex gap-1 overflow-x-auto lg:flex-col">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button
              type="button"
              onClick={() => i < step && setStep(i)}
              className={`w-full whitespace-nowrap rounded-xl px-3 py-2 text-left text-sm ${i === step ? "bg-brand-primary font-semibold text-brand-on-primary" : i < step ? "text-brand-text" : "text-brand-muted"}`}
            >
              {i + 1}. {s}
            </button>
          </li>
        ))}
      </ol>

      <section className="card space-y-5 p-6">
        {step === 0 && (
          <>
            <label className="block text-sm">
              <span className="text-brand-muted">Start from</span>
              <select className={input} value={templateId} onChange={(e) => applyTemplate(e.target.value)}>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  ["name", "Café name"],
                  ["address", "Address"],
                  ["ownerName", "Owner name"],
                  ["ownerEmail", "Owner email (their login)"],
                  ["ownerPhone", "Owner phone"],
                ] as [keyof typeof d, string][]
              ).map(([k, label]) => (
                <label key={k} className="block text-sm">
                  <span className="text-brand-muted">{label}</span>
                  <input
                    className={input}
                    type={k === "ownerEmail" ? "email" : "text"}
                    value={d[k]}
                    onChange={(e) => {
                      set(k, e.target.value);
                      if (k === "name" && !d.slug) setSlugMsg(null);
                    }}
                  />
                </label>
              ))}
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <div className="flex flex-wrap items-center gap-4">
              <span className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl" style={{ background: colors.background }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {logo ? <img src={logo} alt="Logo" className="max-h-20 max-w-20 object-contain" /> : <span style={{ color: colors.primary }} className="text-3xl font-bold">{d.name.slice(0, 1) || "?"}</span>}
              </span>
              <label className={`${btn2} cursor-pointer`}>
                Upload logo
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const r = await processLogo(f);
                    setLogo(r.dataUrl);
                    setSuggest(r.suggestions);
                    if (r.suggestions[0]) setColors(paletteFrom(r.suggestions[0]));
                  }}
                />
              </label>
              {logo && (
                <button type="button" className="text-sm text-brand-muted" onClick={() => setLogo(null)}>
                  Remove
                </button>
              )}
            </div>
            {suggest.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm text-brand-muted">Colors from the logo (tap to use):</p>
                <div className="flex gap-2">
                  {suggest.map((c) => (
                    <button key={c} type="button" title={c} onClick={() => setColors(paletteFrom(c))} className="h-10 w-10 rounded-full border-2 border-brand-text/20" style={{ background: c }} />
                  ))}
                </div>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-3">
              {(Object.keys(colors) as (keyof Colors)[]).map((k) => (
                <label key={k} className="block text-sm">
                  <span className="text-brand-muted">{k.replace(/([A-Z])/g, " $1").toLowerCase()}</span>
                  <span className="flex gap-2">
                    <input type="color" value={colors[k]} onChange={(e) => setColors({ ...colors, [k]: e.target.value })} className="h-10 w-12 rounded" />
                    <input className={input} value={colors[k]} onChange={(e) => setColors({ ...colors, [k]: e.target.value })} />
                  </span>
                </label>
              ))}
            </div>
            <label className="block text-sm">
              <span className="text-brand-muted">Tagline on the counter (optional)</span>
              <input className={input} value={d.tagline} onChange={(e) => set("tagline", e.target.value)} />
            </label>
            <div className="rounded-2xl p-4" style={{ background: colors.background, color: colors.text }}>
              <p className="font-semibold">Preview</p>
              <p style={{ color: colors.muted }}>Keep your streak going</p>
              <span className="mt-2 inline-block rounded-xl px-4 py-2 font-semibold" style={{ background: colors.primary, color: colors.onPrimary }}>
                Check in
              </span>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <label className="block text-sm">
              <span className="text-brand-muted">Subdomain</span>
              <span className="flex items-center gap-2">
                <input
                  className={input}
                  value={d.slug}
                  placeholder={d.name.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 30)}
                  onChange={(e) => {
                    set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
                    setSlugMsg(null);
                  }}
                />
                <span className="whitespace-nowrap text-brand-muted">.streakify.com</span>
              </span>
            </label>
            <div className="flex items-center gap-3">
              <button type="button" className={btn2} onClick={async () => setSlugMsg(await checkSlugAction(d.slug || d.name.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 30)))}>
                Check availability
              </button>
              {slugMsg && <span className={slugMsg.ok ? "text-green-700 dark:text-green-300" : "text-red-600"}>{slugMsg.message}</span>}
            </div>
            {!d.slug && slugMsg?.ok && <input type="hidden" />}
            <label className="block text-sm">
              <span className="text-brand-muted">Time zone (weeks and birthdays use it)</span>
              <select className={input} value={d.timezone} onChange={(e) => set("timezone", e.target.value)}>
                {ZONES.map((z) => (
                  <option key={z}>{z}</option>
                ))}
              </select>
            </label>
          </>
        )}

        {step === 3 && (
          <>
            <p className="text-sm text-brand-muted">Menu items become passport stamps. Price and ingredient cost feed the profit view.</p>
            {program.menu.categories.map((cat, ci) => (
              <div key={cat.id} className="space-y-2 rounded-xl border border-brand-text/10 p-3">
                <div className="flex gap-2">
                  <input className={`${input} font-semibold`} value={cat.name} onChange={(e) => mutate((p) => (p.menu.categories[ci].name = e.target.value))} />
                  <button type="button" className="px-2 text-red-600" onClick={() => mutate((p) => ((p.menu.items = p.menu.items.filter((i) => i.categoryId !== cat.id)), p.menu.categories.splice(ci, 1)))}>
                    ✕
                  </button>
                </div>
                {program.menu.items.map((it, ii) =>
                  it.categoryId !== cat.id ? null : (
                    <div key={it.id} className="grid grid-cols-[1fr_90px_90px_28px] items-center gap-2 text-sm">
                      <input className={input} value={it.name} onChange={(e) => mutate((p) => (p.menu.items[ii].name = e.target.value))} />
                      <input className={input} inputMode="decimal" title="Price" defaultValue={dollars(it.priceCents)} onChange={(e) => mutate((p) => (p.menu.items[ii].priceCents = cents(e.target.value)))} />
                      <input className={input} inputMode="decimal" title="Ingredient cost" defaultValue={dollars(it.costCents)} onChange={(e) => mutate((p) => (p.menu.items[ii].costCents = cents(e.target.value)))} />
                      <button type="button" className="text-red-600" onClick={() => mutate((p) => p.menu.items.splice(ii, 1))}>
                        ✕
                      </button>
                    </div>
                  ),
                )}
                <p className="text-xs text-brand-muted">Name · price $ · ingredient cost $</p>
                <button type="button" className="text-sm text-brand-primary" onClick={() => mutate((p) => p.menu.items.push({ id: uid("item"), name: "New item", categoryId: cat.id, icon: "☕", priceCents: 0, costCents: 0 }))}>
                  + Add item
                </button>
              </div>
            ))}
            <button type="button" className={btn2} onClick={() => mutate((p) => p.menu.categories.push({ id: uid("cat"), name: "New section", icon: "☕" }))}>
              + Add menu section
            </button>
          </>
        )}

        {step === 4 && (
          <>
            <p className="text-sm text-brand-muted">Level names, the XP needed, and what each level gives. Everything else (badges, challenges, mystery prizes) comes from the template and can be edited later.</p>
            {program.levels.map((l, i) => (
              <div key={l.key} className="grid gap-2 rounded-xl border border-brand-text/10 p-3 text-sm sm:grid-cols-[1fr_90px_1fr_80px_80px]">
                <input className={input} value={l.name} onChange={(e) => mutate((p) => (p.levels[i].name = e.target.value))} />
                <input className={input} type="number" disabled={i === 0} value={l.minXp} onChange={(e) => mutate((p) => (p.levels[i].minXp = Number(e.target.value)))} title="XP needed" />
                <input className={input} placeholder="Reward (blank = none)" value={l.reward?.name ?? ""} onChange={(e) => mutate((p) => (p.levels[i].reward = e.target.value ? { valueCents: 0, costCents: 0, ...p.levels[i].reward, name: e.target.value } : undefined))} />
                <input className={input} inputMode="decimal" title="Value $" defaultValue={dollars(l.reward?.valueCents ?? 0)} onChange={(e) => mutate((p) => p.levels[i].reward && (p.levels[i].reward!.valueCents = cents(e.target.value)))} />
                <input className={input} inputMode="decimal" title="Cost $" defaultValue={dollars(l.reward?.costCents ?? 0)} onChange={(e) => mutate((p) => p.levels[i].reward && (p.levels[i].reward!.costCents = cents(e.target.value)))} />
              </div>
            ))}
            <p className="text-xs text-brand-muted">Name · XP needed · reward · value $ · cost $</p>
            <button type="button" className={btn2} onClick={() => mutate((p) => p.levels.push({ key: uid("level"), name: "New level", icon: "⭐", minXp: p.levels[p.levels.length - 1].minXp + 800 }))}>
              + Add level
            </button>
          </>
        )}

        {step === 5 && (
          <>
            <p className="text-sm text-brand-muted">
              The name of the discount button the cashier presses in Toast for each reward. Leave it as &ldquo;Streak Reward&rdquo; if the café uses one open-amount discount for everything.
            </p>
            {rewardSlots.map((slot, i) => (
              <label key={i} className="grid items-center gap-2 text-sm sm:grid-cols-[1fr_240px]">
                <span>{slot.label}</span>
                <input
                  className={input}
                  value={slot.get(program)?.posLabel ?? "Streak Reward"}
                  onChange={(e) =>
                    mutate((p) => {
                      const r = slot.get(p);
                      if (r) slot.put(p, { ...r, posLabel: e.target.value });
                    })
                  }
                />
              </label>
            ))}
          </>
        )}

        {step === 6 && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="text-brand-muted">Status</span>
                <select className={input} value={plan.status} onChange={(e) => setPlan({ ...plan, status: e.target.value as "trial" | "active" })}>
                  <option value="trial">Trial</option>
                  <option value="active">Active (paying)</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-brand-muted">Monthly price ($)</span>
                <input className={input} inputMode="decimal" value={plan.price} onChange={(e) => setPlan({ ...plan, price: e.target.value })} />
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-5 w-5 accent-[var(--brand-primary)]" checked={plan.setupFeePaid} onChange={(e) => setPlan({ ...plan, setupFeePaid: e.target.checked })} /> Setup fee paid
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-5 w-5 accent-[var(--brand-primary)]" checked={plan.demo} onChange={(e) => setPlan({ ...plan, demo: e.target.checked })} /> Demo mode: fill with fake customers for pitching
            </label>
            <div className="rounded-xl bg-brand-bg p-4 text-sm">
              <p className="font-semibold">On create:</p>
              <ul className="mt-1 list-disc pl-5 text-brand-muted">
                <li>
                  {d.name || "The café"} goes live at <strong>{d.slug}.streakify.com</strong> with a new counter PIN.
                </li>
                <li>An owner login is created for {d.ownerEmail || "the owner"} and they get an invite link to set their password.</li>
              </ul>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </>
        )}

        <div className="flex justify-between border-t border-brand-text/10 pt-4">
          <button type="button" className={btn2} disabled={step === 0} onClick={() => setStep(step - 1)}>
            Back
          </button>
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              className={btn}
              disabled={!canNext}
              onClick={async () => {
                if (step === 1 && !d.slug) set("slug", d.name.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 30));
                setStep(step + 1);
              }}
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              className={btn}
              disabled={pending}
              onClick={() =>
                start(async () => {
                  setError(null);
                  const r = await createCafeAction({
                    ...d,
                    logoUrl: logo,
                    colors,
                    tagline: d.tagline || undefined,
                    program,
                    status: plan.status,
                    planPriceCents: cents(plan.price),
                    setupFeePaid: plan.setupFeePaid,
                    demo: plan.demo,
                  });
                  if (r.ok) setDone(r);
                  else setError(r.message);
                })
              }
            >
              {pending ? "Creating…" : "Create café & invite owner"}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
