/**
 * The owner's dashboard content: profit view, stats, chart, top regulars,
 * rewards, leaderboard, monthly PDF reports. Used by /dashboard AND by your
 * admin "view as owner", so you always see exactly what the owner sees.
 *
 * `repo` is the owner's database access (limited by Row Level Security).
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { CafeLogo } from "@/components/CafeLogo";
import { Leaderboard } from "@/components/Leaderboard";
import { VisitsChart } from "@/components/VisitsChart";
import { mysteryBudgetLeft } from "@/lib/checkin/service";
import type { Cafe, Repo } from "@/lib/data";
import { monthlyLeaderboard } from "@/lib/leaderboard";
import { formatMoney } from "@/lib/money";
import { KIND_LABELS, computeStats } from "@/lib/stats";
import { formatMonth, localDate, monthRange, previousMonth } from "@/lib/time";

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-4">
      <p className="text-sm text-brand-muted">{label}</p>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-brand-muted">{sub}</p>}
    </div>
  );
}

const nextMonth = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`;
};

export async function OwnerDashboard({
  cafe,
  repo,
  monthParam,
  hrefFor,
  actions,
  footer,
}: {
  cafe: Cafe;
  repo: Repo;
  monthParam: unknown;
  hrefFor: (q: Record<string, string>) => string;
  actions?: ReactNode;
  footer?: ReactNode;
}) {
  const today = localDate(new Date(), cafe.timezone);
  const thisMonth = today.slice(0, 7);
  const month = typeof monthParam === "string" && /^\d{4}-\d{2}$/.test(monthParam) && monthParam <= thisMonth ? monthParam : thisMonth;
  const { from, to } = monthRange(`${month}-01`);
  const [customers, visits, rewards, board, budgetLeft] = await Promise.all([
    repo.listCustomers(cafe.id),
    repo.listVisits(cafe.id, from, to),
    repo.listRewardActivity(cafe.id, from, to),
    monthlyLeaderboard(cafe, new Date(), month, 10, repo),
    mysteryBudgetLeft(cafe, new Date(), repo),
  ]);
  const s = computeStats(cafe, customers, visits, rewards, from, to);
  const money = (c: number) => formatMoney(c, cafe.currency);
  const isCurrent = month === thisMonth;
  const prev = previousMonth(month);
  const badgeCounts = cafe.program.badges
    .map((b) => ({ name: b.name, count: customers.filter((c) => c.game.badges[b.key]).length }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
  const stampCounts = cafe.program.menu.items
    .map((i) => ({ name: i.name, count: customers.filter((c) => c.game.stamps[i.id]).length }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
  const reportMonths = [thisMonth, prev, previousMonth(prev)];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <CafeLogo name={cafe.name} logoUrl={cafe.brand.logoUrl} size="sm" />
          {cafe.isDemo && <span className="rounded-full bg-brand-primary/15 px-3 py-1 text-xs text-brand-primary">Demo</span>}
          {(cafe.status === "paused" || cafe.status === "cancelled") && <span className="rounded-full bg-red-500/15 px-3 py-1 text-xs text-red-500">Rewards paused</span>}
        </div>
        <div className="flex flex-wrap gap-2 text-sm">{actions}</div>
      </header>

      <div className="flex items-center gap-3">
        <Link href={hrefFor({ month: prev })} className="pressable rounded-lg bg-brand-surface px-3 py-1" aria-label="Previous month">‹</Link>
        <h1 className="text-2xl font-bold tracking-tight">
          {formatMonth(month)}
          {isCurrent && <span className="ml-2 text-base font-normal text-brand-muted">so far</span>}
        </h1>
        {month < thisMonth && (
          <Link href={hrefFor({ month: nextMonth(month) })} className="pressable rounded-lg bg-brand-surface px-3 py-1" aria-label="Next month">›</Link>
        )}
      </div>

      <section className="card border border-brand-primary/40 p-6">
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
          {s.rewardsUsedCount} rewards used × ingredient cost = {money(s.rewardCostCents)}. {s.repeatVisits} repeat visits × {money(cafe.program.averageTicketCents)} average order ={" "}
          {money(s.extraRevenueCents)}. Some regulars would have come anyway, so treat this as an estimate.
        </p>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Visits" value={String(s.totalVisits)} sub={`${s.uniqueVisitors} different customers`} />
        <Stat label="New members" value={String(s.newMembers)} sub={`${s.totalMembers} members total`} />
        <Stat label="Repeat visits" value={String(s.repeatVisits)} />
        <Stat label="Rewards used" value={String(s.rewardsUsedCount)} sub={`${money(s.rewardsUsedValueCents)} saved by customers`} />
      </section>

      <section className="card p-5">
        <h2 className="mb-4 font-semibold">Visits per day</h2>
        <VisitsChart data={s.visitsByDay} />
        {cafe.posProvider === "toast" && <p className="mt-2 text-sm text-brand-muted">{s.verifiedVisits} of {s.totalVisits} visits matched to a Toast order.</p>}
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="card p-5">
          <h2 className="font-semibold">Top regulars</h2>
          <table className="mt-3 w-full text-left text-sm">
            <thead className="text-brand-muted">
              <tr>
                <th className="pb-2 font-normal">Name</th>
                <th className="pb-2 font-normal">Level</th>
                <th className="pb-2 text-right font-normal">Streak</th>
                <th className="pb-2 text-right font-normal">Visits</th>
              </tr>
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

        <section className="card space-y-3 p-5">
          <h2 className="font-semibold">Rewards given</h2>
          <table className="w-full text-left text-sm">
            <thead className="text-brand-muted">
              <tr>
                <th className="pb-2 font-normal">Type</th>
                <th className="pb-2 text-right font-normal">Earned</th>
                <th className="pb-2 text-right font-normal">Value</th>
              </tr>
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
          <p className="text-sm text-brand-muted">
            {s.outstandingRewards} rewards not used yet. Members by level: {s.levelCounts.map((l) => `${l.level} ${l.count}`).join(" · ")}. {s.smsOptIns} agreed to texts.
          </p>
        </section>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="card p-5">
          <h2 className="font-semibold">Mystery prize budget</h2>
          <p className="mt-2 text-2xl font-bold tabular-nums">
            {money(cafe.program.mystery.monthlyBudgetCents - budgetLeft)} <span className="text-base font-normal text-brand-muted">of {money(cafe.program.mystery.monthlyBudgetCents)} used</span>
          </p>
          <p className="mt-1 text-sm text-brand-muted">When it runs out, only XP prizes come out, so you never overspend.</p>
        </div>
        <div className="card p-5">
          <h2 className="font-semibold">Most-earned badges</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {badgeCounts.map((b) => (
              <li key={b.name} className="flex justify-between">
                <span>{b.name}</span>
                <span className="tabular-nums text-brand-muted">{b.count}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="card p-5">
          <h2 className="font-semibold">Most-tried drinks</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {stampCounts.map((b) => (
              <li key={b.name} className="flex justify-between">
                <span>{b.name}</span>
                <span className="tabular-nums text-brand-muted">{b.count}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <Leaderboard entries={board} prize={cafe.program.leaderboardPrize ?? null} monthLabel={formatMonth(month)} />
        <section className="card p-5">
          <h2 className="font-semibold">Monthly reports (PDF)</h2>
          <ul className="mt-3 space-y-2">
            {reportMonths.map((m) => (
              <li key={m}>
                <a className="pressable flex items-center justify-between rounded-xl bg-brand-bg px-4 py-2.5 text-sm" href={`/api/report/${cafe.slug}/${m}`}>
                  <span>{formatMonth(m)}{m === thisMonth ? " (so far)" : ""}</span>
                  <span className="text-brand-primary">Download</span>
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-brand-muted">Your report is also emailed on the 1st of each month.</p>
        </section>
      </div>
      {footer}
    </div>
  );
}
