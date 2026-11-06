/**
 * Turns streak numbers into the friendly sentences customers see:
 *   "You saved $4.50 today. Come back by Sunday, Nov 15 to save $1.50 next time."
 *   "2 more visits until your free pastry."
 *   "Your streak ends tomorrow — that's $6 you'll lose."
 *
 * Kept separate from the engine so wording can change without touching rules.
 */
import { formatMoney } from "../money";
import type { Program } from "../program";
import { formatDay, localDate, weekEnd, weekStart } from "../time";
import {
  type Clock,
  type StreakEvent,
  type StreakState,
  nextDeadline,
  progressFor,
  streakRisk,
  weekGoalMet,
} from "./engine";

export type UpcomingReward = { name: string; valueCents: number; visitsAway: number };

/** The closest reward the customer is working toward (welcome or level). */
export function nextUpcomingReward(s: StreakState, program: Program): UpcomingReward | null {
  const options: UpcomingReward[] = [];
  const w = program.welcomeReward;
  if (w?.enabled && s.totalVisits < w.onVisit) {
    options.push({ name: w.name, valueCents: w.valueCents, visitsAway: w.onVisit - s.totalVisits });
  }
  const p = progressFor(s.streakVisits, program);
  if (p.target?.reward) {
    options.push({ name: p.target.reward.name, valueCents: p.target.reward.valueCents, visitsAway: p.visitsToTarget });
  }
  options.sort((a, b) => a.visitsAway - b.visitsAway || b.valueCents - a.valueCents);
  return options[0] ?? null;
}

function lower(name: string) {
  // "Free pastry" -> "free pastry" (but keep "$1.50 off" as-is)
  return name.charAt(0).toLowerCase() + name.slice(1);
}

export function progressLine(s: StreakState, program: Program): string {
  const p = progressFor(s.streakVisits, program);
  if (!p.target) {
    return p.level.perk ? `You're at ${p.level.name}: ${p.level.perk}` : `You're at the top level: ${p.level.name}!`;
  }
  const what = p.target.reward ? `your ${lower(p.target.reward.name)}` : `${p.target.name}`;
  const visits = p.visitsToTarget === 1 ? "1 more visit" : `${p.visitsToTarget} more visits`;
  return `${visits} until ${what}.`;
}

export function nextTimeLine(s: StreakState, program: Program, clock: Clock, currency: string): string {
  const by = formatDay(nextDeadline(s, program, clock));
  if (!weekGoalMet(s, program, clock)) {
    const today = localDate(clock.now, clock.timeZone);
    const thisWeek = weekStart(today, program.weekStartsOn);
    const done = s.lastVisitWeek === thisWeek ? s.weekVisits : 0;
    const needed = program.visitsPerWeek - done;
    const end = formatDay(weekEnd(today, program.weekStartsOn));
    return `Visit ${needed === 1 ? "1 more time" : `${needed} more times`} by ${end} to keep your streak.`;
  }
  const next = nextUpcomingReward(s, program);
  if (!next) return `Come back by ${by} to keep your streak going.`;
  if (next.visitsAway <= 1) {
    return `Come back by ${by} to save ${formatMoney(next.valueCents, currency)} next time.`;
  }
  return `Come back by ${by}. ${next.visitsAway} more visits until your ${lower(next.name)} (${formatMoney(next.valueCents, currency)} value).`;
}

export function savedTodayLine(savedTodayCents: number, currency: string): string | null {
  return savedTodayCents > 0 ? `You saved ${formatMoney(savedTodayCents, currency)} today.` : null;
}

export function totalSavedLine(totalSavedCents: number, currency: string): string {
  return totalSavedCents > 0
    ? `You've saved ${formatMoney(totalSavedCents, currency)} since joining.`
    : "Your savings start with your first reward.";
}

export function riskLine(s: StreakState, program: Program, clock: Clock, currency: string): string | null {
  const risk = streakRisk(s, program, clock);
  if (!risk) return null;
  const when = risk.daysLeft === 0 ? "tonight" : "tomorrow";
  if (risk.saverWillCover) {
    return `Your streak ends ${when}. Your streak saver will cover you this time, but visiting keeps it for later.`;
  }
  return `Your streak ends ${when}, that's ${formatMoney(risk.atRiskCents, currency)} you'll lose.`;
}

/** Explains what happened while they were away (savers used, level drops). */
export function eventLines(events: StreakEvent[], program: Program): string[] {
  const name = (key: string) => program.levels.find((l) => l.key === key)?.name ?? key;
  const lines: string[] = [];
  const savers = events.filter((e) => e.type === "saver_used").length;
  if (savers) {
    lines.push(
      savers === 1
        ? "Your streak saver protected you for a missed week."
        : `Your streak savers protected you for ${savers} missed weeks.`,
    );
  }
  const drops = events.filter((e) => e.type === "level_drop");
  if (drops.length) {
    const last = drops[drops.length - 1] as Extract<StreakEvent, { type: "level_drop" }>;
    lines.push(`You missed ${drops.length === 1 ? "a week" : `${drops.length} weeks`} and moved down to ${name(last.toLevel)}. Rewards you already earned are safe.`);
  } else if (events.some((e) => e.type === "streak_reset")) {
    lines.push("Your streak restarted. Rewards you already earned are safe.");
  }
  return lines;
}
