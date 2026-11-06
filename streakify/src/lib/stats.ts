/**
 * Numbers for the owner dashboard, the admin page and the monthly PDF.
 * Pure calculation: give it raw rows, get totals back.
 *
 * PROFIT VIEW, in plain words:
 *   Reward cost   = ingredient cost of every reward actually USED in the period
 *   Extra revenue = repeat visits x average order size
 *                   (a repeat visit = any visit that isn't a customer's very first)
 * It's an estimate: some of those people would have come anyway. The page
 * says so, and the owner sets the average order size.
 */
import type { Cafe, Customer, RewardRow, VisitRow } from "./data/types";
import { levelIndexFor } from "./streak/engine";
import { addDays, diffDays, localDate } from "./time";

export type CafeStats = {
  from: string;
  to: string;
  visitsByDay: { date: string; count: number }[];
  totalVisits: number;
  uniqueVisitors: number;
  newMembers: number;
  repeatVisits: number;
  verifiedVisits: number;
  totalMembers: number;
  smsOptIns: number;
  rewardsEarned: { kind: string; count: number; valueCents: number }[];
  rewardsUsedCount: number;
  rewardsUsedValueCents: number;
  rewardCostCents: number;
  outstandingRewards: number;
  extraRevenueCents: number;
  netCents: number;
  topRegulars: { customerId: string; firstName: string; visits: number; level: string; streakWeeks: number }[];
  levelCounts: { level: string; count: number }[];
};

export function computeStats(
  cafe: Cafe,
  customers: Customer[],
  visits: VisitRow[],
  rewards: RewardRow[],
  from: string,
  to: string,
): CafeStats {
  const byDay = new Map<string, number>();
  for (let d = from; d <= to; d = addDays(d, 1)) byDay.set(d, 0);
  const perCustomer = new Map<string, number>();
  let verifiedVisits = 0;
  for (const v of visits) {
    if (v.localDate < from || v.localDate > to) continue;
    byDay.set(v.localDate, (byDay.get(v.localDate) ?? 0) + 1);
    perCustomer.set(v.customerId, (perCustomer.get(v.customerId) ?? 0) + 1);
    if (v.verified) verifiedVisits++;
  }
  const totalVisits = [...perCustomer.values()].reduce((a, b) => a + b, 0);

  const joinedInRange = customers.filter((c) => {
    const d = localDate(new Date(c.createdAt), cafe.timezone);
    return d >= from && d <= to;
  });
  // Each new member's first visit is not a "repeat"; everything else is.
  const firstVisitsInRange = joinedInRange.filter((c) => perCustomer.has(c.id)).length;
  const repeatVisits = Math.max(0, totalVisits - firstVisitsInRange);

  const earned = new Map<string, { count: number; valueCents: number }>();
  let rewardsUsedCount = 0;
  let rewardsUsedValueCents = 0;
  let rewardCostCents = 0;
  for (const r of rewards) {
    if (r.earnedLocalDate >= from && r.earnedLocalDate <= to) {
      const e = earned.get(r.kind) ?? { count: 0, valueCents: 0 };
      e.count++;
      e.valueCents += r.valueCents;
      earned.set(r.kind, e);
    }
    if (r.status === "redeemed" && r.redeemedLocalDate && r.redeemedLocalDate >= from && r.redeemedLocalDate <= to) {
      rewardsUsedCount++;
      rewardsUsedValueCents += r.valueCents;
      rewardCostCents += r.costCents;
    }
  }

  const byId = new Map(customers.map((c) => [c.id, c]));
  const levelName = (c: Customer) => cafe.program.levels[levelIndexFor(c.xp, cafe.program.levels)].name;
  const topRegulars = [...perCustomer.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .flatMap(([id, n]) => {
      const c = byId.get(id);
      return c ? [{ customerId: id, firstName: c.firstName, visits: n, level: levelName(c), streakWeeks: c.streakWeeks }] : [];
    });

  const levelCounts = cafe.program.levels.map((l) => ({ level: l.name, count: 0 }));
  for (const c of customers) levelCounts[levelIndexFor(c.xp, cafe.program.levels)].count++;

  const extraRevenueCents = repeatVisits * cafe.program.averageTicketCents;
  return {
    from,
    to,
    visitsByDay: [...byDay.entries()].map(([date, count]) => ({ date, count })),
    totalVisits,
    uniqueVisitors: perCustomer.size,
    newMembers: joinedInRange.length,
    repeatVisits,
    verifiedVisits,
    totalMembers: customers.length,
    smsOptIns: customers.filter((c) => c.smsOptIn).length,
    rewardsEarned: [...earned.entries()].map(([kind, e]) => ({ kind, ...e })),
    rewardsUsedCount,
    rewardsUsedValueCents,
    rewardCostCents,
    outstandingRewards: rewards.filter((r) => r.status === "available").length,
    extraRevenueCents,
    netCents: extraRevenueCents - rewardCostCents,
    topRegulars,
    levelCounts,
  };
}

export const KIND_LABELS: Record<string, string> = {
  welcome: "Welcome",
  level: "Level-up",
  surprise: "Surprise",
  birthday: "Birthday",
  leaderboard: "Leaderboard prize",
};

/** Days in the period (for averages). */
export function periodDays(s: CafeStats) {
  return diffDays(s.from, s.to) + 1;
}
