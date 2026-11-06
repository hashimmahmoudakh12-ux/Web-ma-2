"use client";
import { useActionState, useState, useTransition } from "react";
import { adminLogin, createCafe, emailReportNow, runJobsNow, updateCafeAdmin, type Result } from "./actions";

const input = "w-full rounded-lg bg-black/40 px-3 py-2 outline-none ring-amber-400 focus:ring-2";

export function AdminLogin() {
  const [error, action, pending] = useActionState(adminLogin, null);
  return (
    <form action={action} className="mx-auto mt-16 max-w-sm space-y-4 rounded-2xl bg-white/5 p-6">
      <h1 className="text-2xl font-bold">Streakify admin</h1>
      <input type="password" name="password" placeholder="Admin password" required autoFocus className={input} />
      {error && <p className="text-red-300">{error}</p>}
      <button disabled={pending} className="w-full rounded-lg bg-amber-400 py-2 font-semibold text-black disabled:opacity-50">Log in</button>
    </form>
  );
}

function Msg({ r }: { r: Result | null }) {
  if (!r) return null;
  return <p className={`text-sm ${r.ok ? "text-emerald-300" : "text-red-300"}`}>{r.message}</p>;
}

export function NewCafeForm() {
  const [r, action, pending] = useActionState(createCafe, null);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <input name="name" placeholder="Café name" required className={input} />
      <input name="slug" placeholder="subdomain (e.g. bluebird)" required className={input} />
      <input name="timezone" defaultValue="America/New_York" className={input} title="IANA time zone" />
      <input name="ownerEmail" type="email" placeholder="Owner email (for monthly report)" className={input} />
      <label className="flex items-center gap-2 text-sm">Background <input type="color" name="background" defaultValue="#16100b" /></label>
      <label className="flex items-center gap-2 text-sm">Brand color <input type="color" name="primary" defaultValue="#d4a24c" /></label>
      <input name="ownerPassword" type="text" placeholder="Owner password (6+ chars)" required className={input} />
      <input name="counterPin" inputMode="numeric" placeholder="Counter PIN (4-8 digits)" required className={input} />
      <div className="flex items-center gap-3 sm:col-span-2">
        <button disabled={pending} className="rounded-lg bg-amber-400 px-4 py-2 font-semibold text-black disabled:opacity-50">Create café</button>
        <Msg r={r} />
      </div>
    </form>
  );
}

export function CafeSettingsForm(props: {
  cafeId: string;
  ownerEmail: string;
  customDomain: string;
  timezone: string;
  posProvider: string;
  toastRestaurantGuid: string;
  toastDiscountGuid: string;
}) {
  const [r, action, pending] = useActionState(updateCafeAdmin, null);
  const [pos, setPos] = useState(props.posProvider);
  return (
    <form action={action} className="grid gap-2 text-sm sm:grid-cols-2">
      <input type="hidden" name="cafeId" value={props.cafeId} />
      <label>Owner email<input name="ownerEmail" type="email" defaultValue={props.ownerEmail} className={input} /></label>
      <label>Time zone<input name="timezone" defaultValue={props.timezone} className={input} /></label>
      <label>New owner password<input name="ownerPassword" placeholder="leave blank to keep" className={input} /></label>
      <label>New counter PIN<input name="counterPin" inputMode="numeric" placeholder="leave blank to keep" className={input} /></label>
      <label>Custom domain<input name="customDomain" defaultValue={props.customDomain} placeholder="rewards.cafe.com" className={input} /></label>
      <label>POS
        <select name="posProvider" value={pos} onChange={(e) => setPos(e.target.value)} className={input}>
          <option value="none">None (trust the tablet)</option>
          <option value="toast">Toast</option>
        </select>
      </label>
      {pos === "toast" && (
        <>
          <label>Toast restaurant GUID<input name="toastRestaurantGuid" defaultValue={props.toastRestaurantGuid} className={input} /></label>
          <label>&quot;Streak Reward&quot; discount GUID<input name="toastDiscountGuid" defaultValue={props.toastDiscountGuid} className={input} /></label>
        </>
      )}
      {pos !== "toast" && (
        <>
          <input type="hidden" name="toastRestaurantGuid" value={props.toastRestaurantGuid} />
          <input type="hidden" name="toastDiscountGuid" value={props.toastDiscountGuid} />
        </>
      )}
      <div className="flex items-center gap-3 sm:col-span-2">
        <button disabled={pending} className="rounded-lg bg-white/15 px-4 py-2 font-semibold disabled:opacity-50">Save</button>
        <Msg r={r} />
      </div>
    </form>
  );
}

export function EmailReportButton({ cafeId, month, label }: { cafeId: string; month: string; label: string }) {
  const [r, setR] = useState<Result | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex items-center gap-2">
      <button disabled={pending} onClick={() => start(async () => setR(await emailReportNow(cafeId, month)))} className="rounded-lg bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20 disabled:opacity-50">
        {pending ? "Sending…" : label}
      </button>
      <Msg r={r} />
    </span>
  );
}

export function RunJobsButton() {
  const [r, setR] = useState<Result | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <button disabled={pending} onClick={() => start(async () => setR(await runJobsNow()))} className="rounded-lg bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20 disabled:opacity-50">
        {pending ? "Running…" : "Run daily jobs now (texts + monthly reports)"}
      </button>
      {r && <pre className="max-h-48 overflow-auto rounded-lg bg-black/40 p-3 text-xs">{r.message}</pre>}
    </div>
  );
}
