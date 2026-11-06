/**
 * CAFÉ OWNER DASHBOARD: sanaacafe.streakify.com/owner (password protected).
 * Visits per day, top regulars, rewards given, and the profit view.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { CafeLogo } from "@/components/CafeLogo";
import { Leaderboard } from "@/components/Leaderboard";
import { VisitsChart } from "@/components/VisitsChart";
import { getRepo } from "@/lib/data";
import { mysteryBudgetLeft } from "@/lib/checkin/service";
import { monthlyLeaderboard } from "@/lib/leaderboard";
import { formatMoney } from "@/lib/money";
import { KIND_LABELS, computeStats } from "@/lib/stats";
import { resolveCafe } from "@/lib/tenant";
import { formatMonth, localDate, monthRange, previousMonth } from "@/lib/time";
import { cafeBase } from "@/lib/urls";
import { ownerCafe, ownerLogin, ownerLogout } from "./actions";
import { DeleteCustomer } from "./DeleteCustomer";
import { LoginForm } from "./LoginForm";

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl bg-brand-surface p-4">
      <p className="text-sm text-brand-muted">{label}</p>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-brand-muted">{sub}</p>}
    </div>
  );
}

async function Dashboard({ params, searchParams }: PageProps<"/site/[site]/owner">) {
  await connection();
  const { site } = await params;
  const cafeAny = await resolveCafe(site);
  if (!cafeAny) notFound();
  const cafe = await ownerCafe(site);
  if (!cafe) {
    return (
      <main className="flex flex-1 items-center px-4 py-10">
        <LoginForm action={ownerLogin.bind(null, site)} cafeName={cafeAny.name} />
      </main>
    );
  }

  const base = await cafeBase();
  const today = localDate(new Date(), cafe.timezone);
  const thisMonth = today.slice(0, 7);
  const q = (await searchParams).month;
  const month = typeof q === "string" && /^\d{4}-\d{2}$/.test(q) && q <= thisMonth ? q : thisMonth;
  const { from, to: monthEnd } = monthRange(`${month}-01`);
  const repo = getRepo();
  const [customers, visits, rewards, board] = await Promise.all([
    repo.listCustomers(cafe.id),
    repo.listVisits(cafe.id, from, monthEnd),
    repo.listRewardActivity(cafe.id, from, monthEnd),
    monthlyLeaderboard(cafe, new Date(), month),
  ]);
  const s = computeStats(cafe, customers, visits, rewards, from, monthEnd);
  const budgetLeft = await mysteryBudgetLeft(cafe);
  const badgeCounts = cafe.program.badges
    .map((b) => ({ name: b.name, icon: b.icon, count: customers.filter((c) => c.game.badges[b.key]).length }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
  const stampCounts = cafe.program.menu.items
    .map((i) => ({ name: i.name, icon: i.icon, count: customers.filter((c) => c.game.stamps[i.id]).length }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
  const money = (c: number) => formatMoney(c, cafe.currency);
  const isCurrent = month === thisMonth;
  const prev = previousMonth(month);
  const next = month < thisMonth ? (() => { const [y, m] = month.split("-").map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`; })() : null;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 space-y-6 px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <CafeLogo name={cafe.name} logoUrl={cafe.brand.logoUrl} size="sm" />
          <span className="text-brand-muted">Owner dashboard</span>
          {cafe.isDemo && <span className="rounded-full bg-brand-primary/20 px-3 py-1 text-xs text-brand-primary">Demo</span>}
        </div>
        <nav className="flex gap-2 text-sm">
          <Link href={`${base}/owner/settings`} className="rounded-lg bg-brand-surface px-3 py-2">Edit rewards & look</Link>
          <Link href={`${base}/counter`} className="rounded-lg bg-brand-surface px-3 py-2">Counter screen</Link>
          {!cafe.isDemo && (
            <form action={ownerLogout.bind(null, site)}>
              <button className="rounded-lg px-3 py-2 text-brand-muted">Log out</button>
            </form>
          )}
        </nav>
      </header>

      <div className="flex items-center gap-3">
        <Link href={`?month=${prev}`} className="rounded-lg bg-brand-surface px-3 py-1" aria-label="Previous month">‹</Link>
        <h1 className="text-2xl font-bold">{formatMonth(month)}{isCurrent && <span className="ml-2 text-base font-normal text-brand-muted">so far</span>}</h1>
        {next && <Link href={`?month=${next}`} className="rounded-lg bg-brand-surface px-3 py-1" aria-label="Next month">›</Link>}
      </div>

      {/* PROFIT VIEW */}
      <section className="rounded-3xl border border-brand-primary/50 bg-brand-surface p-6">
        <p className="text-sm uppercase tracking-widest text-brand-muted">Profit view</p>
        <p className="mt-2 text-2xl font-semibold leading-snug sm:text-3xl">
          Rewards cost you <span className="text-brand-primary">{money(s.rewardCostCents)}</span> {isCurrent ? "this month" : `in ${formatMonth(month)}`}, extra visits brought in{" "}
          <span className="text-brand-primary">{money(s.extraRevenueCents)}</span>.
        </p>
        <p className="mt-2 text-lg">
          Estimated return: <strong>{s.netCents >= 0 ? "+" : "−"}{money(Math.abs(s.netCents))}</strong>
          {s.rewardCostCents > 0 && <span className="text-brand-muted"> ({(s.extraRevenueCents / s.rewardCostCents).toFixed(1)}× what rewards cost)</span>}
        </p>
        <p className="mt-3 text-sm text-brand-muted">
          How it&apos;s calculated: {s.rewardsUsedCount} rewards used × their ingredient cost = {money(s.rewardCostCents)}. {s.repeatVisits} repeat
          visits × {money(cafe.program.averageTicketCents)} average order = {money(s.extraRevenueCents)}. Some regulars would have come anyway, so
          treat this as an estimate. Change the average order and ingredient costs in settings.
        </p>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Visits" value={String(s.totalVisits)} sub={`${s.uniqueVisitors} different customers`} />
        <Stat label="New members" value={String(s.newMembers)} sub={`${s.totalMembers} members total`} />
        <Stat label="Repeat visits" value={String(s.repeatVisits)} />
        <Stat label="Rewards used" value={String(s.rewardsUsedCount)} sub={`${money(s.rewardsUsedValueCents)} saved by customers`} />
      </section>

      <section className="rounded-2xl bg-brand-surface p-5">
        <h2 className="mb-4 font-semibold">Visits per day</h2>
        <VisitsChart data={s.visitsByDay} />
        {cafe.posProvider === "toast" && (
          <p className="mt-2 text-sm text-brand-muted">{s.verifiedVisits} of {s.totalVisits} visits matched to a Toast order.</p>
        )}
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-2xl bg-brand-surface p-5">
          <h2 className="font-semibold">Top regulars</h2>
          <table className="mt-3 w-full text-left">
            <thead className="text-sm text-brand-muted">
              <tr><th className="pb-2">Name</th><th className="pb-2">Level</th><th className="pb-2 text-right">Streak</th><th className="pb-2 text-right">Visits</th></tr>
            </thead>
            <tbody>
              {s.topRegulars.map((r) => (
                <tr key={r.customerId} className="border-t border-brand-text/10">
                  <td className="py-1.5">{r.firstName}</td>
                  <td className="py-1.5 text-brand-muted">{r.level}</td>
                  <td className="py-1.5 text-right tabular-nums">{r.streakWeeks} wk</td>
                  <td className="py-1.5 text-right tabular-nums">{r.visits}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {s.topRegulars.length === 0 && <p className="mt-2 text-brand-muted">No visits yet.</p>}
        </section>

        <section className="space-y-4 rounded-2xl bg-brand-surface p-5">
          <h2 className="font-semibold">Rewards given</h2>
          <table className="w-full text-left">
            <thead className="text-sm text-brand-muted">
              <tr><th className="pb-2">Type</th><th className="pb-2 text-right">Earned</th><th className="pb-2 text-right">Value</th></tr>
            </thead>
            <tbody>
              {s.rewardsEarned.map((r) => (
                <tr key={r.kind} className="border-t border-brand-text/10">
                  <td className="py-1.5">{KIND_LABELS[r.kind] ?? r.kind}</td>
                  <td className="py-1.5 text-right tabular-nums">{r.count}</td>
                  <td className="py-1.5 text-right tabular-nums">{money(r.valueCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-sm text-brand-muted">{s.outstandingRewards} earned rewards not used yet. Members by level:{" "}
            {s.levelCounts.map((l) => `${l.level} ${l.count}`).join(" · ")}. {s.smsOptIns} members agreed to texts.</p>
        </section>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl bg-brand-surface p-5">
          <h2 className="font-semibold">🫖 Mystery dallah budget</h2>
          <p className="mt-2 text-2xl font-bold tabular-nums">{money(cafe.program.mystery.monthlyBudgetCents - budgetLeft)} <span className="text-base font-normal text-brand-muted">of {money(cafe.program.mystery.monthlyBudgetCents)} used this month</span></p>
          <p className="mt-1 text-sm text-brand-muted">When it runs out, dallahs only give XP prizes, so you never overspend.</p>
        </div>
        <div className="rounded-2xl bg-brand-surface p-5">
          <h2 className="font-semibold">🏅 Most-earned badges</h2>
          <ul className="mt-2 space-y-1 text-sm">{badgeCounts.map((b) => <li key={b.name} className="flex justify-between"><span>{b.icon} {b.name}</span><span className="tabular-nums text-brand-muted">{b.count}</span></li>)}</ul>
        </div>
        <div className="rounded-2xl bg-brand-surface p-5">
          <h2 className="font-semibold">☕ Most-tried drinks (passport)</h2>
          <ul className="mt-2 space-y-1 text-sm">{stampCounts.map((b) => <li key={b.name} className="flex justify-between"><span>{b.icon} {b.name}</span><span className="tabular-nums text-brand-muted">{b.count}</span></li>)}</ul>
        </div>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <Leaderboard entries={board} prize={cafe.program.leaderboardPrize ?? null} monthLabel={formatMonth(month)} />
        <DeleteCustomer siteKey={site} />
      </div>
    </main>
  );
}

export default function OwnerPage(props: PageProps<"/site/[site]/owner">) {
  return (
    <Suspense fallback={<div className="flex-1" />}>
      <Dashboard {...props} />
    </Suspense>
  );
}
