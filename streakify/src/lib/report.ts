/**
 * MONTHLY PDF REPORT for one café (phase 4).
 * Built with pdf-lib (pure JavaScript, runs anywhere incl. Vercel).
 */
import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { getRepo, type Cafe, type Repo } from "./data";
import { monthlyLeaderboard } from "./leaderboard";
import { formatMoney } from "./money";
import { KIND_LABELS, computeStats, type CafeStats } from "./stats";
import { formatMonth, formatShortDay, monthRange } from "./time";

export async function monthlyStats(cafe: Cafe, month: string, repo: Repo = getRepo()): Promise<CafeStats> {
  const { from, to } = monthRange(`${month}-01`);
  const [customers, visits, rewards] = await Promise.all([
    repo.listCustomers(cafe.id),
    repo.listVisits(cafe.id, from, to),
    repo.listRewardActivity(cafe.id, from, to),
  ]);
  return computeStats(cafe, customers, visits, rewards, from, to);
}

function hexToRgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/** Built-in PDF fonts only cover basic Latin characters. */
const safe = (s: string) =>
  s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/[^\x20-\x7E\xA0-\xFF]/g, "");

export async function renderMonthlyReport(cafe: Cafe, month: string, repo: Repo = getRepo()): Promise<Uint8Array> {
  const stats = await monthlyStats(cafe, month, repo);
  const board = await monthlyLeaderboard(cafe, new Date(), month, 5, repo);
  const money = (c: number) => formatMoney(c, cafe.currency);

  const pdf = await PDFDocument.create();
  pdf.setTitle(`${cafe.name} - ${formatMonth(month)} rewards report`);
  pdf.setProducer("Streakify");
  const page = pdf.addPage([612, 792]); // US Letter
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.1, 0.1, 0.1);
  const muted = rgb(0.42, 0.42, 0.42);
  const accent = hexToRgb(cafe.brand.colors.primary);
  const dark = hexToRgb(cafe.brand.colors.background);
  const M = 48;
  const W = 612 - M * 2;

  const text = (p: PDFPage, s: string, x: number, y: number, size = 11, f: PDFFont = font, color = ink) =>
    p.drawText(safe(s), { x, y, size, font: f, color });

  // Header band in the café's color
  page.drawRectangle({ x: 0, y: 792 - 96, width: 612, height: 96, color: dark });
  text(page, cafe.name, M, 792 - 50, 22, bold, rgb(1, 1, 1));
  text(page, `Rewards report - ${formatMonth(month)}`, M, 792 - 72, 12, font, accent);

  let y = 792 - 130;
  // Profit headline (wrapped)
  const headline = `Rewards cost you ${money(stats.rewardCostCents)} in ${formatMonth(month)}, extra visits brought in ${money(stats.extraRevenueCents)}.`;
  const words = headline.split(" ");
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (bold.widthOfTextAtSize(test, 16) > W) {
      text(page, line, M, y, 16, bold);
      y -= 22;
      line = w;
    } else line = test;
  }
  text(page, line, M, y, 16, bold);
  y -= 20;
  text(page, `Estimated return: ${stats.netCents >= 0 ? "+" : "-"}${money(Math.abs(stats.netCents))}. Repeat visits x ${money(cafe.program.averageTicketCents)} average order, minus ingredient cost of rewards used.`, M, y, 9, font, muted);
  y -= 36;

  // KPI tiles
  const kpis: [string, string][] = [
    ["Visits", String(stats.totalVisits)],
    ["Customers", String(stats.uniqueVisitors)],
    ["New members", String(stats.newMembers)],
    ["Rewards used", String(stats.rewardsUsedCount)],
  ];
  const tileW = (W - 3 * 10) / 4;
  kpis.forEach(([label, value], i) => {
    const x = M + i * (tileW + 10);
    page.drawRectangle({ x, y: y - 50, width: tileW, height: 58, color: rgb(0.96, 0.95, 0.93) });
    text(page, label, x + 10, y - 8, 9, font, muted);
    text(page, value, x + 10, y - 36, 22, bold);
  });
  y -= 84;

  // Visits per day bars
  text(page, "Visits per day", M, y, 12, bold);
  y -= 12;
  const chartH = 110;
  const days = stats.visitsByDay;
  const max = Math.max(1, ...days.map((d) => d.count));
  const gap = 2;
  const barW = (W - gap * (days.length - 1)) / days.length;
  page.drawLine({ start: { x: M, y: y - chartH }, end: { x: M + W, y: y - chartH }, thickness: 0.5, color: muted });
  days.forEach((d, i) => {
    const h = (d.count / max) * (chartH - 12);
    if (h > 0) page.drawRectangle({ x: M + i * (barW + gap), y: y - chartH, width: barW, height: h, color: accent });
  });
  text(page, `max ${max}/day`, M + W - 50, y - 4, 8, font, muted);
  text(page, formatShortDay(days[0].date), M, y - chartH - 12, 8, font, muted);
  text(page, formatShortDay(days[days.length - 1].date), M + W - 30, y - chartH - 12, 8, font, muted);
  y -= chartH + 40;

  // Two columns: top regulars | rewards + leaderboard
  const colW = W / 2 - 10;
  let yl = y;
  text(page, "Top regulars", M, yl, 12, bold);
  yl -= 18;
  for (const r of stats.topRegulars.slice(0, 10)) {
    text(page, r.firstName, M, yl, 10);
    text(page, r.level, M + 110, yl, 10, font, muted);
    text(page, `${r.visits} visits`, M + colW - 50, yl, 10);
    yl -= 15;
  }
  if (!stats.topRegulars.length) text(page, "No visits this month.", M, yl, 10, font, muted);

  let yr = y;
  const xr = M + colW + 20;
  text(page, "Rewards earned", xr, yr, 12, bold);
  yr -= 18;
  for (const r of stats.rewardsEarned) {
    text(page, KIND_LABELS[r.kind] ?? r.kind, xr, yr, 10);
    text(page, `${r.count}  (${money(r.valueCents)})`, xr + 120, yr, 10);
    yr -= 15;
  }
  if (!stats.rewardsEarned.length) {
    text(page, "None this month.", xr, yr, 10, font, muted);
    yr -= 15;
  }
  yr -= 12;
  text(page, "Leaderboard", xr, yr, 12, bold);
  yr -= 18;
  for (const e of board) {
    text(page, `${e.rank}. ${e.firstName}`, xr, yr, 10);
    text(page, `${e.visits} visits`, xr + 120, yr, 10);
    yr -= 15;
  }
  if (board.length && cafe.program.leaderboardPrize) text(page, `Prize for #1: ${cafe.program.leaderboardPrize}`, xr, yr - 2, 9, font, muted);

  const yb = Math.min(yl, yr) - 30;
  text(page, `Members: ${stats.totalMembers} total, ${stats.smsOptIns} agreed to texts. Unused rewards outstanding: ${stats.outstandingRewards}.`, M, Math.max(yb, 70), 9, font, muted);
  text(page, "Powered by Streakify", M, 36, 8, font, muted);
  return pdf.save();
}
