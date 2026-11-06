/**
 * Scheduled jobs. Vercel calls /api/cron/daily once a day (see vercel.json).
 *  - every day: "streak ends tomorrow" texts
 *  - first 3 days of a month: last month's leaderboard prize + PDF report email
 * Monthly work is recorded in job_runs so it never happens twice.
 */
import "server-only";
import { getRepo, type Cafe } from "./data";
import { sendEmail } from "./email";
import { monthlyLeaderboard } from "./leaderboard";
import { formatMoney } from "./money";
import { monthlyStats, renderMonthlyReport } from "./report";
import { runStreakReminders } from "./sms";
import { formatMonth, localDate, previousMonth } from "./time";

export async function awardLeaderboardPrize(cafe: Cafe, month: string, now = new Date()) {
  const p = cafe.program;
  if (!p.leaderboardPrize) return null;
  const [winner] = await monthlyLeaderboard(cafe, now, month, 1);
  if (!winner) return null;
  if (!(await getRepo().claimJob(cafe.id, "leaderboard_prize", month))) return null;
  await getRepo().grantReward(
    cafe.id,
    winner.customerId,
    { kind: "leaderboard", name: `#1 ${formatMonth(month)}: ${p.leaderboardPrize}`, valueCents: p.leaderboardPrizeValueCents, costCents: p.leaderboardPrizeCostCents },
    now,
    localDate(now, cafe.timezone),
  );
  return winner.firstName;
}

export async function emailMonthlyReport(cafe: Cafe, month: string) {
  if (!cafe.ownerEmail) return { sent: false, reason: "No owner email" };
  if (!(await getRepo().claimJob(cafe.id, "report_email", month))) return { sent: false, reason: "Already sent" };
  const [pdf, s] = await Promise.all([renderMonthlyReport(cafe, month), monthlyStats(cafe, month)]);
  const money = (c: number) => formatMoney(c, cafe.currency);
  const html = `<p>Hi! Here is ${cafe.name}'s rewards report for ${formatMonth(month)}.</p>
<p><strong>Rewards cost you ${money(s.rewardCostCents)}, extra visits brought in ${money(s.extraRevenueCents)}.</strong></p>
<p>${s.totalVisits} visits from ${s.uniqueVisitors} customers, ${s.newMembers} new members, ${s.rewardsUsedCount} rewards used.</p>
<p>The full report is attached.</p><p style="color:#888">Powered by Streakify</p>`;
  return sendEmail(cafe.ownerEmail, `${cafe.name}: your ${formatMonth(month)} rewards report`, html, [
    { filename: `${cafe.slug}-${month}-report.pdf`, content: pdf },
  ]);
}

export async function runDailyJobs(now = new Date()) {
  const cafes = await getRepo().listCafes();
  const summary: Record<string, unknown> = {};
  for (const cafe of cafes) {
    const out: Record<string, unknown> = {};
    try {
      out.reminders = await runStreakReminders(cafe, now);
      const today = localDate(now, cafe.timezone);
      if (!cafe.isDemo && Number(today.slice(8, 10)) <= 3) {
        const last = previousMonth(today.slice(0, 7));
        out.leaderboardWinner = await awardLeaderboardPrize(cafe, last, now);
        out.report = await emailMonthlyReport(cafe, last);
      }
    } catch (e) {
      out.error = e instanceof Error ? e.message : String(e);
      console.error(`[cron] ${cafe.slug}:`, e);
    }
    summary[cafe.slug] = out;
  }
  return summary;
}
