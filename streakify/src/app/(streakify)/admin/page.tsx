/**
 * MY ADMIN PAGE (only you): streakify.com/admin
 * All cafés in one place with this month's numbers, PDF reports,
 * monthly emails, café settings, and "add a café".
 */
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { getRepo } from "@/lib/data";
import { twilioConfigured } from "@/lib/sms";
import { formatMoney } from "@/lib/money";
import { monthlyStats } from "@/lib/report";
import { isAdmin } from "@/lib/session";
import { formatMonth, localDate, previousMonth } from "@/lib/time";
import { adminLogout } from "./actions";
import { AdminLogin, CafeSettingsForm, EmailReportButton, NewCafeForm, RunJobsButton } from "./Forms";

export const metadata: Metadata = { title: "Streakify admin", robots: { index: false } };

function Pill({ ok, label }: { ok: boolean; label: string }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs ${ok ? "bg-emerald-400/15 text-emerald-300" : "bg-white/10 text-white/50"}`}>{label}: {ok ? "on" : "off"}</span>;
}

async function Admin() {
  await connection();
  if (!(await isAdmin())) return <AdminLogin />;
  const repo = getRepo();
  const cafes = await repo.listCafes();
  const rows = await Promise.all(
    cafes.map(async (cafe) => {
      const month = localDate(new Date(), cafe.timezone).slice(0, 7);
      return { cafe, month, last: previousMonth(month), stats: await monthlyStats(cafe, month) };
    }),
  );
  const totals = rows.reduce((t, r) => ({ visits: t.visits + r.stats.totalVisits, members: t.members + r.stats.totalMembers }), { visits: 0, members: 0 });

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Streakify admin</h1>
          <p className="text-white/60">{cafes.length} cafés · {totals.members} members · {totals.visits} visits this month</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Pill ok={repo.kind === "supabase"} label="Database" />
          <Pill ok={twilioConfigured()} label="Texts" />
          <Pill ok={Boolean(process.env.RESEND_API_KEY && process.env.REPORT_FROM_EMAIL)} label="Email" />
          <Pill ok={Boolean(process.env.TOAST_CLIENT_ID)} label="Toast" />
          <form action={adminLogout}><button className="ml-2 text-sm text-white/60">Log out</button></form>
        </div>
      </header>
      {repo.kind === "memory" && (
        <p className="rounded-lg border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-200">
          Demo storage: data lives in memory and resets when the server restarts. Connect Supabase before real customers use it.
        </p>
      )}

      <div className="space-y-4">
        {rows.map(({ cafe, month, last, stats }) => (
          <section key={cafe.id} className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="h-8 w-8 rounded-full border border-white/20" style={{ background: `linear-gradient(135deg, ${cafe.brand.colors.background} 50%, ${cafe.brand.colors.primary} 50%)` }} />
                <div>
                  <h2 className="text-xl font-semibold">
                    {cafe.name} {cafe.isDemo && <span className="ml-1 rounded bg-teal-400/20 px-2 py-0.5 text-xs text-teal-200">DEMO</span>}
                  </h2>
                  <p className="text-sm text-white/50">{cafe.customDomain ?? `${cafe.slug}.<your domain>`} · {cafe.timezone}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 text-sm">
                <a className="rounded-lg bg-white/10 px-3 py-1.5 hover:bg-white/20" href={`/c/${cafe.slug}/counter`}>Counter</a>
                <a className="rounded-lg bg-white/10 px-3 py-1.5 hover:bg-white/20" href={`/c/${cafe.slug}/owner`}>Owner dashboard</a>
                <a className="rounded-lg bg-white/10 px-3 py-1.5 hover:bg-white/20" href={`/c/${cafe.slug}`}>Public page</a>
              </div>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
              {[
                ["Visits " + formatMonth(month).split(" ")[0], String(stats.totalVisits)],
                ["Members", String(stats.totalMembers)],
                ["New members", String(stats.newMembers)],
                ["Reward cost", formatMoney(stats.rewardCostCents, cafe.currency)],
                ["Extra revenue (est.)", formatMoney(stats.extraRevenueCents, cafe.currency)],
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg bg-black/30 p-3">
                  <dt className="text-white/50">{k}</dt>
                  <dd className="text-lg font-semibold tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <a className="rounded-lg bg-amber-400 px-3 py-1.5 text-sm font-semibold text-black" href={`/api/report/${cafe.slug}/${last}`}>PDF {formatMonth(last)}</a>
              <a className="rounded-lg bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20" href={`/api/report/${cafe.slug}/${month}`}>PDF {formatMonth(month)} (so far)</a>
              <EmailReportButton cafeId={cafe.id} month={last} label={`Email ${formatMonth(last)} report to owner`} />
            </div>
            <details className="mt-4">
              <summary className="cursor-pointer text-sm text-white/70">Café settings (owner login, PIN, domain, Toast)</summary>
              <div className="mt-3">
                <CafeSettingsForm
                  cafeId={cafe.id}
                  ownerEmail={cafe.ownerEmail ?? ""}
                  customDomain={cafe.customDomain ?? ""}
                  timezone={cafe.timezone}
                  posProvider={cafe.posProvider}
                  toastRestaurantGuid={String(cafe.posConfig.restaurantGuid ?? "")}
                  toastDiscountGuid={String(cafe.posConfig.streakRewardDiscountGuid ?? "")}
                />
              </div>
            </details>
          </section>
        ))}
      </div>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <h2 className="mb-3 text-xl font-semibold">Add a café</h2>
        <p className="mb-4 text-sm text-white/60">Starts with the standard reward ladder; the owner can change everything from their dashboard.</p>
        <NewCafeForm />
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <h2 className="mb-1 text-xl font-semibold">Automations</h2>
        <p className="mb-3 text-sm text-white/60">
          Every day at 16:00 UTC: “streak ends tomorrow” texts to opted-in customers. On the 1st–3rd of each month: last month&apos;s leaderboard prize
          and the PDF report emailed to each owner (once per month).
        </p>
        <RunJobsButton />
      </section>
    </div>
  );
}

export default function AdminPage() {
  return (
    <main className="min-h-dvh bg-[#0b0b0c] text-neutral-100">
      <Suspense fallback={<p className="p-8 text-white/50">Loading…</p>}>
        <Admin />
      </Suspense>
    </main>
  );
}
