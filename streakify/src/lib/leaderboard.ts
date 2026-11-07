/**
 * MONTHLY LEADERBOARD: most visits this calendar month (café time).
 * Only customers who opted in appear, and only by first name / nickname.
 * It "resets" automatically because it only counts this month's visits.
 */
import "server-only";
import { getRepo, type Cafe, type Repo } from "./data";
import { localDate, monthRange } from "./time";

export type LeaderboardEntry = { rank: number; customerId: string; firstName: string; visits: number };

export async function monthlyLeaderboard(cafe: Cafe, now = new Date(), month?: string, limit = 10, repo: Repo = getRepo()): Promise<LeaderboardEntry[]> {
  const { from, to } = monthRange(month ? `${month}-01` : localDate(now, cafe.timezone));
  const [visits, customers] = await Promise.all([repo.listVisits(cafe.id, from, to), repo.listCustomers(cafe.id)]);
  const optedIn = new Map(customers.filter((c) => c.leaderboardOptIn).map((c) => [c.id, c.firstName]));
  const counts = new Map<string, { visits: number; last: string }>();
  for (const v of visits) {
    if (!optedIn.has(v.customerId)) continue;
    const e = counts.get(v.customerId) ?? { visits: 0, last: "" };
    e.visits++;
    if (v.createdAt > e.last) e.last = v.createdAt;
    counts.set(v.customerId, e);
  }
  // Ties: whoever reached that count first ranks higher.
  const sorted = [...counts.entries()].sort((a, b) => b[1].visits - a[1].visits || a[1].last.localeCompare(b[1].last));
  return sorted.slice(0, limit).map(([customerId, e], i) => ({
    rank: i + 1,
    customerId,
    firstName: optedIn.get(customerId)!,
    visits: e.visits,
  }));
}
