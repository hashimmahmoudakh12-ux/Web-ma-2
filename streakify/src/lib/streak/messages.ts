/**
 * Turns game numbers into the friendly sentences customers see:
 *   "You saved $4.50 today. Come back by Sunday, Nov 15 to save $1.50 next time."
 *   "250 XP to Regular (about 2 visits) and your free pastry."
 *   "Your streak ends tomorrow, that's $6 you'll lose."
 * Kept separate from the engine so wording can change without touching rules.
 */
import { formatMoney } from "../money";
import type { Program } from "../program";
import { formatDay, localDate, weekEnd, weekStart } from "../time";
import {
  type Clock,
  type GameContext,
  type StreakEvent,
  type StreakState,
  badgeProgress,
  nextDeadline,
  normalizeGame,
  progressFor,
  streakRisk,
  weekGoalMet,
  xpPerVisitEstimate,
} from "./engine";

export type UpcomingReward = { name: string; valueCents: number; visitsAway: number };

const visitsFor = (xp: number, s: StreakState, program: Program) => Math.max(1, Math.ceil(xp / xpPerVisitEstimate(s, program)));
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The closest reward the customer is working toward (welcome or level). */
export function nextUpcomingReward(s: StreakState, program: Program): UpcomingReward | null {
  const options: UpcomingReward[] = [];
  const w = program.welcomeReward;
  if (w?.enabled && s.totalVisits < w.onVisit) options.push({ name: w.name, valueCents: w.valueCents, visitsAway: w.onVisit - s.totalVisits });
  const p = progressFor(s.xp, program);
  if (p.rewardTarget?.reward) {
    options.push({ name: p.rewardTarget.reward.name, valueCents: p.rewardTarget.reward.valueCents, visitsAway: visitsFor(p.xpToRewardTarget, s, program) });
  }
  options.sort((a, b) => a.visitsAway - b.visitsAway || b.valueCents - a.valueCents);
  return options[0] ?? null;
}

function lower(name: string) {
  return name.charAt(0).toLowerCase() + name.slice(1);
}

export function progressLine(s: StreakState, program: Program): string {
  const p = progressFor(s.xp, program);
  if (!p.next) return p.level.perk ? `You're a ${p.level.name}: ${p.level.perk}.` : `You've reached the top level: ${p.level.name}!`;
  const visits = visitsFor(p.xpToNext, s, program);
  const bonus = p.next.reward ? ` and your ${lower(p.next.reward.name)}` : p.next.perk ? ` (${p.next.perk})` : "";
  return `${p.xpToNext} XP to ${p.next.name} (about ${plural(visits, "visit")})${bonus}.`;
}

export function nextTimeLine(s: StreakState, program: Program, clock: Clock, currency: string): string {
  const by = formatDay(nextDeadline(s, program, clock));
  if (!weekGoalMet(s, program, clock)) {
    const today = localDate(clock.now, clock.timeZone);
    const done = s.lastVisitWeek === weekStart(today, program.weekStartsOn) ? s.weekVisits : 0;
    const needed = program.visitsPerWeek - done;
    return `Visit ${needed === 1 ? "1 more time" : `${needed} more times`} by ${formatDay(weekEnd(today, program.weekStartsOn))} to keep your streak.`;
  }
  const next = nextUpcomingReward(s, program);
  if (!next) return `Come back by ${by} to keep your streak going.`;
  if (next.visitsAway <= 1) return `Come back by ${by} to save ${formatMoney(next.valueCents, currency)} next time.`;
  return `Come back by ${by}. About ${next.visitsAway} more visits until your ${lower(next.name)} (${formatMoney(next.valueCents, currency)} value).`;
}

export function savedTodayLine(savedTodayCents: number, currency: string): string | null {
  return savedTodayCents > 0 ? `You saved ${formatMoney(savedTodayCents, currency)} today.` : null;
}

export function totalSavedLine(totalSavedCents: number, currency: string): string {
  return totalSavedCents > 0 ? `You've saved ${formatMoney(totalSavedCents, currency)} since joining.` : "Your savings start with your first reward.";
}

export function riskLine(s: StreakState, program: Program, clock: Clock, currency: string): string | null {
  const risk = streakRisk(s, program, clock);
  if (!risk) return null;
  const when = risk.daysLeft === 0 ? "tonight" : "tomorrow";
  if (risk.saverWillCover) return `Your streak ends ${when}. Your streak saver will cover you this time, but visiting keeps it for later.`;
  return `Your streak ends ${when}, that's ${formatMoney(risk.atRiskCents, currency)} you'll lose.`;
}

/** Explains what happened while they were away (savers used, level drops). */
export function eventLines(events: StreakEvent[], program: Program): string[] {
  const name = (key: string) => program.levels.find((l) => l.key === key)?.name ?? key;
  const lines: string[] = [];
  const savers = events.filter((e) => e.type === "saver_used").length;
  if (savers) lines.push(savers === 1 ? "Your streak saver protected you for a missed week." : `Your streak savers protected you for ${savers} missed weeks.`);
  const drops = events.filter((e) => e.type === "level_drop");
  if (drops.length) {
    const last = drops[drops.length - 1] as Extract<StreakEvent, { type: "level_drop" }>;
    lines.push(`You missed ${drops.length === 1 ? "a week" : `${drops.length} weeks`} and moved down to ${name(last.toLevel)}. Rewards and badges you earned are safe.`);
  } else if (events.some((e) => e.type === "streak_reset")) {
    lines.push("Your streak restarted. Rewards and badges you earned are safe.");
  }
  return lines;
}

export type NextBadge = { key: string; name: string; icon: string; description: string; current: number; target: number };

/** The locked badge the customer is closest to. */
export function nextBadge(s: StreakState, program: Program, ctx: GameContext): NextBadge | null {
  const g = normalizeGame(s.game);
  let best: NextBadge | null = null;
  let bestFrac = -1;
  for (const b of program.badges) {
    if (g.badges[b.key]) continue;
    const p = badgeProgress(b, { ...s, game: g }, program, ctx);
    if (!p || p.target <= 0) continue;
    const frac = p.current / p.target;
    if (frac < 1 && frac > bestFrac) {
      bestFrac = frac;
      best = { key: b.key, name: b.name, icon: b.icon, description: b.description, current: p.current, target: p.target };
    }
  }
  return best;
}
