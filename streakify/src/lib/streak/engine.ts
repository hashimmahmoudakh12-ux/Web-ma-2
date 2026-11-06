/**
 * THE STREAK ENGINE — the heart of Streakify.
 *
 * Pure functions only: no database, no network, no clock. You give it the
 * customer's current streak state + the café's rules + "now", and it returns
 * the new state and what happened. That makes it easy to test (see
 * engine.test.ts) and means the same rules run in demo mode, real mode,
 * and (later) Toast-verified mode.
 *
 * HOW THE RULES WORK
 * - Every check-in adds 1 "streak visit". Levels (Bronze, Silver, ...) unlock
 *   at a number of streak visits.
 * - Each week the customer must visit at least `visitsPerWeek` times.
 * - A missed week first uses a streak saver (N per month). With no saver
 *   left, the customer drops ONE level (per missed week). Rewards already
 *   earned are never taken away.
 * - Weeks are "settled" lazily: when the customer next shows up we look back
 *   at every week that ended since last time and apply savers/drops in order.
 */
import type { Level, Program, RewardSpec } from "../program";
import { addDays, diffDays, localDate, monthKey, weekEnd, weekStart } from "../time";

export type StreakState = {
  streakVisits: number;
  streakWeeks: number; // consecutive weeks the weekly goal was met
  totalVisits: number; // lifetime, never goes down
  lastVisitAt: string | null; // ISO timestamp
  lastVisitWeek: string | null; // first day of the week of the last visit
  weekVisits: number; // visits during lastVisitWeek
  settledWeek: string | null; // weeks before this one are already settled
  saverMonth: string | null; // "2026-11": month the saver counter refers to
  saversUsedInMonth: number;
  birthdayRewardYear: number | null; // year we last gave a birthday reward
  birthdayMonth: number | null; // 1-12, optional
  birthdayDay: number | null; // 1-31, optional
};

export function newStreakState(birthday?: { month: number; day: number } | null): StreakState {
  return {
    streakVisits: 0,
    streakWeeks: 0,
    totalVisits: 0,
    lastVisitAt: null,
    lastVisitWeek: null,
    weekVisits: 0,
    settledWeek: null,
    saverMonth: null,
    saversUsedInMonth: 0,
    birthdayRewardYear: null,
    birthdayMonth: birthday?.month ?? null,
    birthdayDay: birthday?.day ?? null,
  };
}

export type StreakEvent =
  | { type: "saver_used"; week: string }
  | { type: "level_drop"; week: string; fromLevel: string; toLevel: string }
  | { type: "streak_reset"; week: string }
  | { type: "level_up"; toLevel: string };

export type RewardKind = "welcome" | "level" | "surprise" | "birthday";
export type RewardGrant = RewardSpec & { kind: RewardKind; levelKey?: string };

export type Clock = { now: Date; timeZone: string };

// ---------------------------------------------------------------------------
// Levels & progress
// ---------------------------------------------------------------------------

export function levelIndexFor(streakVisits: number, levels: Level[]): number {
  let idx = 0;
  levels.forEach((l, i) => {
    if (streakVisits >= l.minVisits) idx = i;
  });
  return idx;
}

export type Progress = {
  level: Level;
  levelIndex: number;
  isTopLevel: boolean;
  /** The next level that gives a reward or perk (what we show on the bar). */
  target: Level | null;
  visitsToTarget: number;
  /** 0..1 progress from the current level toward `target`. */
  fraction: number;
};

export function progressFor(streakVisits: number, program: Program): Progress {
  const { levels } = program;
  const levelIndex = levelIndexFor(streakVisits, levels);
  const level = levels[levelIndex];
  const target =
    levels.slice(levelIndex + 1).find((l) => l.reward || l.perk) ?? levels[levelIndex + 1] ?? null;
  const visitsToTarget = target ? target.minVisits - streakVisits : 0;
  const span = target ? target.minVisits - level.minVisits : 1;
  const fraction = target ? Math.min(1, (streakVisits - level.minVisits) / span) : 1;
  return {
    level,
    levelIndex,
    isTopLevel: levelIndex === levels.length - 1,
    target,
    visitsToTarget,
    fraction,
  };
}

// ---------------------------------------------------------------------------
// Weekly settlement (savers and drops)
// ---------------------------------------------------------------------------

function hasSomethingToProtect(s: StreakState) {
  return s.streakVisits > 0 || s.streakWeeks > 0;
}

function saverAvailableFor(s: StreakState, program: Program, month: string) {
  if (program.saversPerMonth <= 0) return false;
  return s.saverMonth !== month || s.saversUsedInMonth < program.saversPerMonth;
}

/**
 * Applies every week that has fully ended since we last looked.
 * Returns a NEW state (never mutates the input).
 */
export function settle(
  state: StreakState,
  program: Program,
  clock: Clock,
): { state: StreakState; events: StreakEvent[] } {
  const s: StreakState = { ...state };
  const events: StreakEvent[] = [];
  const today = localDate(clock.now, clock.timeZone);
  const currentWeek = weekStart(today, program.weekStartsOn);

  if (!s.settledWeek) {
    s.settledWeek = currentWeek;
    return { state: s, events };
  }

  for (let w = s.settledWeek; w < currentWeek; w = addDays(w, 7)) {
    const visits = w === s.lastVisitWeek ? s.weekVisits : 0;
    if (visits >= program.visitsPerWeek) continue; // goal met that week
    if (!hasSomethingToProtect(s)) continue; // nothing to lose

    const month = monthKey(weekEnd(w, program.weekStartsOn));
    if (saverAvailableFor(s, program, month)) {
      if (s.saverMonth !== month) {
        s.saverMonth = month;
        s.saversUsedInMonth = 0;
      }
      s.saversUsedInMonth += 1;
      events.push({ type: "saver_used", week: w });
      continue;
    }

    const i = levelIndexFor(s.streakVisits, program.levels);
    if (i > 0) {
      const from = program.levels[i];
      const to = program.levels[i - 1];
      s.streakVisits = to.minVisits;
      events.push({ type: "level_drop", week: w, fromLevel: from.key, toLevel: to.key });
    } else if (s.streakVisits > 0) {
      s.streakVisits = 0;
      events.push({ type: "streak_reset", week: w });
    }
    s.streakWeeks = 0;
  }

  s.settledWeek = currentWeek;
  return { state: s, events };
}

// ---------------------------------------------------------------------------
// Check-in
// ---------------------------------------------------------------------------

export type CheckInOutcome =
  | { ok: false; reason: "cooldown"; nextAllowedAt: Date; lastVisitAt: Date }
  | {
      ok: true;
      before: StreakState; // after settling, before this visit
      state: StreakState; // after this visit
      events: StreakEvent[];
      rewards: RewardGrant[];
      visit: { localDate: string; weekStart: string };
    };

/** Birthday of `year` as a date string; Feb 29 becomes Feb 28 in non-leap years. */
function birthdayIn(year: number, month: number, day: number): string {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const d = Math.min(day, lastDay);
  return `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Returns the birthday year if `today` is within the birthday window. */
export function birthdayWindowYear(s: StreakState, today: string, windowDays: number): number | null {
  if (!s.birthdayMonth || !s.birthdayDay) return null;
  const year = Number(today.slice(0, 4));
  for (const y of [year, year - 1]) {
    const diff = diffDays(birthdayIn(y, s.birthdayMonth, s.birthdayDay), today);
    if (diff >= 0 && diff <= windowDays) return y;
  }
  return null;
}

export function checkIn(
  state: StreakState,
  program: Program,
  clock: Clock,
  random: () => number = Math.random,
): CheckInOutcome {
  // 1) Anti-cheat: one check-in per phone per cooldown window.
  if (state.lastVisitAt) {
    const last = new Date(state.lastVisitAt);
    const nextAllowedAt = new Date(last.getTime() + program.cooldownMinutes * 60_000);
    if (clock.now < nextAllowedAt) {
      return { ok: false, reason: "cooldown", nextAllowedAt, lastVisitAt: last };
    }
  }

  // 2) Settle any weeks that ended since the last visit.
  const settled = settle(state, program, clock);
  const before = settled.state;
  const events = [...settled.events];
  const s: StreakState = { ...before };

  // 3) Count the visit.
  const today = localDate(clock.now, clock.timeZone);
  const week = weekStart(today, program.weekStartsOn);
  if (s.lastVisitWeek !== week) {
    s.lastVisitWeek = week;
    s.weekVisits = 0;
  }
  s.weekVisits += 1;
  s.totalVisits += 1;
  s.streakVisits += 1;
  s.lastVisitAt = clock.now.toISOString();
  if (s.weekVisits === program.visitsPerWeek) s.streakWeeks += 1;

  // 4) Rewards.
  const rewards: RewardGrant[] = [];
  const levelBefore = levelIndexFor(before.streakVisits, program.levels);
  const levelAfter = levelIndexFor(s.streakVisits, program.levels);
  for (let i = levelBefore + 1; i <= levelAfter; i++) {
    const level = program.levels[i];
    events.push({ type: "level_up", toLevel: level.key });
    if (level.reward) rewards.push({ ...level.reward, kind: "level", levelKey: level.key });
  }

  const welcome = program.welcomeReward;
  if (welcome?.enabled && s.totalVisits === welcome.onVisit) {
    rewards.push({ name: welcome.name, valueCents: welcome.valueCents, costCents: welcome.costCents, kind: "welcome" });
  }

  const bday = program.birthdayReward;
  if (bday?.enabled) {
    const year = birthdayWindowYear(s, today, bday.windowDays);
    if (year !== null && s.birthdayRewardYear !== year) {
      s.birthdayRewardYear = year;
      rewards.push({ name: bday.name, valueCents: bday.valueCents, costCents: bday.costCents, kind: "birthday" });
    }
  }

  const surprise = program.surpriseReward;
  if (surprise?.enabled && surprise.chance > 0 && random() < surprise.chance) {
    rewards.push({ name: surprise.name, valueCents: surprise.valueCents, costCents: surprise.costCents, kind: "surprise" });
  }

  return { ok: true, before, state: s, events, rewards, visit: { localDate: today, weekStart: week } };
}

// ---------------------------------------------------------------------------
// Status helpers used for messages
// ---------------------------------------------------------------------------

/** Has the customer already met this week's visit goal? */
export function weekGoalMet(s: StreakState, program: Program, clock: Clock): boolean {
  const week = weekStart(localDate(clock.now, clock.timeZone), program.weekStartsOn);
  return s.lastVisitWeek === week && s.weekVisits >= program.visitsPerWeek;
}

/** The last day the customer can visit to keep the streak going. */
export function nextDeadline(s: StreakState, program: Program, clock: Clock): string {
  const today = localDate(clock.now, clock.timeZone);
  const end = weekEnd(today, program.weekStartsOn);
  return weekGoalMet(s, program, clock) ? addDays(end, 7) : end;
}

export type StreakRisk = {
  endsOn: string; // last day to visit
  daysLeft: number; // 0 = today is the last day, 1 = tomorrow
  atRiskCents: number;
  saverWillCover: boolean;
};

/**
 * Is the streak about to end? Only reports when the deadline is today or
 * tomorrow and this week's goal isn't met yet.
 */
export function streakRisk(state: StreakState, program: Program, clock: Clock): StreakRisk | null {
  const { state: s } = settle(state, program, clock);
  if (!hasSomethingToProtect(s) || weekGoalMet(s, program, clock)) return null;
  const today = localDate(clock.now, clock.timeZone);
  const endsOn = weekEnd(today, program.weekStartsOn);
  const daysLeft = diffDays(today, endsOn);
  if (daysLeft > 1) return null;

  const p = progressFor(s.streakVisits, program);
  const bestReward = Math.max(0, ...program.levels.map((l) => l.reward?.valueCents ?? 0));
  const atRiskCents = p.target?.reward?.valueCents ?? p.level.reward?.valueCents ?? bestReward;
  return {
    endsOn,
    daysLeft,
    atRiskCents,
    saverWillCover: saverAvailableFor(s, program, monthKey(endsOn)),
  };
}
