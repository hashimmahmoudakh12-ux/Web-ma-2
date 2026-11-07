"use client";
/** Interactive pieces of the admin pages. Every button calls a server action that re-checks you're the admin. */
import { useState, useTransition } from "react";
import type { Cafe } from "@/lib/data";
import {
  confirmMfaAction,
  deleteCafeAction,
  emailReportAction,
  enrollMfaAction,
  runJobsNowAction,
  setDemoAction,
  setPinAction,
  setStatusAction,
  teamChangeEmailAction,
  teamInviteAction,
  teamRemoveAction,
  teamResetAction,
  updateCafeAdminAction,
  checkSlugAction,
  type Result,
} from "./actions";

export const input = "w-full rounded-xl border border-brand-text/10 bg-brand-bg px-3 py-2 outline-none focus:border-brand-primary focus:ring-4 focus:ring-brand-primary/15";
export const btn = "pressable rounded-xl bg-brand-primary px-4 py-2 font-semibold text-brand-on-primary disabled:opacity-50";
export const btn2 = "pressable rounded-xl bg-brand-text/10 px-4 py-2 font-semibold disabled:opacity-50";

export function Msg({ r }: { r: Result | null }) {
  if (!r) return null;
  return (
    <div className={`text-sm ${r.ok ? "text-green-700 dark:text-green-300" : "text-red-600 dark:text-red-400"}`}>
      <p>{r.message}</p>
      {r.link && (
        <div className="mt-1 flex gap-2">
          <input readOnly value={r.link} className={`${input} font-mono text-xs`} onFocus={(e) => e.target.select()} />
          <button type="button" className={btn2} onClick={() => navigator.clipboard?.writeText(r.link!)}>
            Copy
          </button>
        </div>
      )}
    </div>
  );
}

function useAction() {
  const [r, setR] = useState<Result | null>(null);
  const [pending, start] = useTransition();
  return { r, pending, run: (fn: () => Promise<Result>) => start(async () => setR(await fn())) };
}

export function RunJobsButton() {
  const a = useAction();
  return (
    <div className="space-y-2">
      <button type="button" disabled={a.pending} className={btn2} onClick={() => a.run(runJobsNowAction)}>
        {a.pending ? "Running…" : "Run daily jobs now"}
      </button>
      {a.r && <pre className="max-h-40 overflow-auto rounded-xl bg-brand-bg p-3 text-xs">{a.r.message}</pre>}
    </div>
  );
}

// ---- 2FA setup ------------------------------------------------------------------------
export function MfaSetup() {
  const [enroll, setEnroll] = useState<{ factorId: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const a = useAction();
  const [err, setErr] = useState<string | null>(null);
  if (a.r?.ok) {
    return (
      <div className="space-y-3">
        <p className="font-semibold text-green-700 dark:text-green-300">{a.r.message}</p>
        <a href="/admin" className={btn}>
          Go to admin
        </a>
      </div>
    );
  }
  if (!enroll) {
    return (
      <div className="space-y-2">
        <button
          type="button"
          className={btn}
          onClick={async () => {
            try {
              setEnroll(await enrollMfaAction());
            } catch (e) {
              setErr(e instanceof Error ? e.message : "Couldn't start setup");
            }
          }}
        >
          Set up two-factor login
        </button>
        {err && <p className="text-sm text-red-500">{err}</p>}
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <ol className="list-decimal space-y-1 pl-5 text-sm">
        <li>Open an authenticator app (Apple Passwords, Google Authenticator, 1Password, Authy).</li>
        <li>Scan this QR code, or type the key below.</li>
        <li>Enter the 6-digit code it shows.</li>
      </ol>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={enroll.qr} alt="QR code for your authenticator app" className="h-48 w-48 rounded-xl bg-white p-2" />
      <p className="break-all font-mono text-xs text-brand-muted">Key: {enroll.secret}</p>
      <div className="flex gap-2">
        <input className={`${input} max-w-[10rem] text-center font-mono tracking-widest`} inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="123456" />
        <button type="button" disabled={code.length !== 6 || a.pending} className={btn} onClick={() => a.run(() => confirmMfaAction(enroll.factorId, code))}>
          Turn on
        </button>
      </div>
      <Msg r={a.r} />
    </div>
  );
}

// ---- café admin settings ---------------------------------------------------------
export function StatusButtons({ cafeId, status }: { cafeId: string; status: Cafe["status"] }) {
  const a = useAction();
  const opts: [Cafe["status"], string][] = [
    ["trial", "Trial"],
    ["active", "Active"],
    ["paused", "Pause"],
    ["cancelled", "Cancelled"],
  ];
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {opts.map(([s, label]) => (
          <button
            key={s}
            type="button"
            disabled={a.pending || s === status}
            className={s === status ? btn : btn2}
            onClick={() => {
              if (s === "paused" && !confirm("Pause this café? The counter will show “Rewards paused”. All data is kept.")) return;
              a.run(() => setStatusAction(cafeId, s));
            }}
          >
            {s === "active" && (status === "paused" || status === "cancelled") ? "Reactivate" : label}
          </button>
        ))}
      </div>
      <Msg r={a.r} />
    </div>
  );
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="text-brand-muted">{label}</span>
      {children}
    </label>
  );
}

export function CafeAdminForm({ cafe }: { cafe: Cafe }) {
  const [f, setF] = useState({
    name: cafe.name,
    slug: cafe.slug,
    customDomain: cafe.customDomain ?? "",
    timezone: cafe.timezone,
    address: cafe.address ?? "",
    ownerName: cafe.ownerName ?? "",
    ownerEmail: cafe.ownerEmail ?? "",
    ownerPhone: cafe.ownerPhone ?? "",
    planDollars: (cafe.planPriceCents / 100).toFixed(2),
    setupFeePaid: cafe.setupFeePaid,
    posProvider: cafe.posProvider,
    toastRestaurantGuid: String(cafe.posConfig.restaurantGuid ?? ""),
    toastDiscountGuid: String(cafe.posConfig.streakRewardDiscountGuid ?? ""),
  });
  const [slugMsg, setSlugMsg] = useState<string | null>(null);
  const a = useAction();
  const set = (k: keyof typeof f, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        a.run(() =>
          updateCafeAdminAction(cafe.id, {
            ...f,
            planPriceCents: Math.round(Number(f.planDollars || 0) * 100),
            posProvider: f.posProvider as "none" | "toast",
          }),
        );
      }}
    >
      <L label="Café name"><input className={input} value={f.name} onChange={(e) => set("name", e.target.value)} /></L>
      <L label="Subdomain">
        <input
          className={input}
          value={f.slug}
          onChange={(e) => set("slug", e.target.value.toLowerCase())}
          onBlur={async () => setSlugMsg((await checkSlugAction(f.slug, cafe.id)).message)}
        />
        {slugMsg && <span className="text-xs text-brand-muted">{slugMsg}</span>}
      </L>
      <L label="Custom domain (optional)"><input className={input} value={f.customDomain} placeholder="rewards.cafe.com" onChange={(e) => set("customDomain", e.target.value)} /></L>
      <L label="Time zone"><input className={input} value={f.timezone} onChange={(e) => set("timezone", e.target.value)} /></L>
      <L label="Address"><input className={input} value={f.address} onChange={(e) => set("address", e.target.value)} /></L>
      <L label="Owner name"><input className={input} value={f.ownerName} onChange={(e) => set("ownerName", e.target.value)} /></L>
      <L label="Owner email (reports go here)"><input className={input} type="email" value={f.ownerEmail} onChange={(e) => set("ownerEmail", e.target.value)} /></L>
      <L label="Owner phone"><input className={input} value={f.ownerPhone} onChange={(e) => set("ownerPhone", e.target.value)} /></L>
      <L label="Plan price ($/month)"><input className={input} inputMode="decimal" value={f.planDollars} onChange={(e) => set("planDollars", e.target.value)} /></L>
      <label className="flex items-center gap-2 pt-6 text-sm">
        <input type="checkbox" className="h-5 w-5 accent-[var(--brand-primary)]" checked={f.setupFeePaid} onChange={(e) => set("setupFeePaid", e.target.checked)} /> Setup fee paid
      </label>
      <L label="POS">
        <select className={input} value={f.posProvider} onChange={(e) => set("posProvider", e.target.value)}>
          <option value="none">None (trust the tablet)</option>
          <option value="toast">Toast</option>
        </select>
      </L>
      {f.posProvider === "toast" ? (
        <>
          <L label="Toast restaurant GUID"><input className={input} value={f.toastRestaurantGuid} onChange={(e) => set("toastRestaurantGuid", e.target.value)} /></L>
          <L label="“Streak Reward” discount GUID"><input className={input} value={f.toastDiscountGuid} onChange={(e) => set("toastDiscountGuid", e.target.value)} /></L>
        </>
      ) : (
        <span />
      )}
      <div className="flex items-center gap-3 sm:col-span-2">
        <button disabled={a.pending} className={btn}>
          {a.pending ? "Saving…" : "Save"}
        </button>
        <Msg r={a.r} />
      </div>
    </form>
  );
}

export function PinForm({ cafeId }: { cafeId: string }) {
  const [pin, setPin] = useState("");
  const a = useAction();
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input className={`${input} max-w-[10rem]`} inputMode="numeric" placeholder="New PIN" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))} />
        <button type="button" disabled={pin.length < 4 || a.pending} className={btn2} onClick={() => a.run(() => setPinAction(cafeId, pin))}>
          Change counter PIN
        </button>
      </div>
      <Msg r={a.r} />
    </div>
  );
}

export function DemoToggle({ cafeId, isDemo }: { cafeId: string; isDemo: boolean }) {
  const a = useAction();
  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={a.pending}
        className={btn2}
        onClick={() => {
          if (isDemo && !confirm("Turn demo off? All fake customers are deleted.")) return;
          if (!isDemo && !confirm("Fill this café with fake customers? Any existing customers are REPLACED.")) return;
          a.run(() => setDemoAction(cafeId, !isDemo));
        }}
      >
        {isDemo ? "Turn demo mode off" : "Fill with fake customers (demo mode)"}
      </button>
      <Msg r={a.r} />
    </div>
  );
}

export function EmailReportButton({ cafeId, month, label }: { cafeId: string; month: string; label: string }) {
  const a = useAction();
  return (
    <span className="inline-flex flex-col gap-1">
      <button type="button" disabled={a.pending} className={btn2} onClick={() => a.run(() => emailReportAction(cafeId, month))}>
        {a.pending ? "Sending…" : label}
      </button>
      <Msg r={a.r} />
    </span>
  );
}

// ---- team --------------------------------------------------------------------------------
export function TeamPanel({ cafeId, members }: { cafeId: string; members: { id: string; email: string; name: string | null; title: string }[] }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [title, setTitle] = useState("Manager");
  const a = useAction();
  return (
    <div className="space-y-4">
      <ul className="divide-y divide-brand-text/10 rounded-xl border border-brand-text/10">
        {members.length === 0 && <li className="p-3 text-sm text-brand-muted">No owner account yet.</li>}
        {members.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
            <span>
              <span className="font-semibold">{m.name ?? m.email}</span> <span className="text-xs text-brand-muted">{m.title}</span>
              <span className="block text-sm text-brand-muted">{m.email}</span>
            </span>
            <span className="flex flex-wrap gap-2 text-sm">
              <button type="button" className={btn2} onClick={() => a.run(() => teamResetAction(cafeId, m.id))}>
                Reset password
              </button>
              <button
                type="button"
                className={btn2}
                onClick={() => {
                  const e = prompt("New email address for this login:", m.email);
                  if (e && e !== m.email) a.run(() => teamChangeEmailAction(cafeId, m.id, e));
                }}
              >
                Change email
              </button>
              <button
                type="button"
                className="pressable rounded-xl px-3 py-2 text-red-600"
                onClick={() => confirm(`Remove ${m.email}? They won't be able to sign in.`) && a.run(() => teamRemoveAction(cafeId, m.id))}
              >
                Remove
              </button>
            </span>
          </li>
        ))}
      </ul>
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
        <input className={input} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className={input} placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <select className={input} value={title} onChange={(e) => setTitle(e.target.value)}>
          <option>Owner</option>
          <option>Manager</option>
        </select>
        <button type="button" disabled={!email || a.pending} className={btn} onClick={() => a.run(() => teamInviteAction(cafeId, email, name, title))}>
          Invite
        </button>
      </div>
      <Msg r={a.r} />
    </div>
  );
}

export function DeleteCafe({ cafeId, name }: { cafeId: string; name: string }) {
  const [typed, setTyped] = useState("");
  const a = useAction();
  return (
    <div className="space-y-2">
      <p className="text-sm">
        This permanently deletes <strong>{name}</strong>, all its customers, visits, rewards and owner logins. Type the café name to confirm.
      </p>
      <div className="flex flex-wrap gap-2">
        <input className={`${input} max-w-xs`} placeholder={name} value={typed} onChange={(e) => setTyped(e.target.value)} />
        <button type="button" disabled={typed !== name || a.pending} className="pressable rounded-xl bg-red-600 px-4 py-2 font-semibold text-white disabled:opacity-40" onClick={() => a.run(() => deleteCafeAction(cafeId, typed))}>
          Delete café forever
        </button>
      </div>
      <Msg r={a.r} />
    </div>
  );
}
