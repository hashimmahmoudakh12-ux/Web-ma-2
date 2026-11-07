/**
 * THE GAME ENGINE — the heart of Streakify.
 *
 * Pure functions only: no database, no network, no real clock. You give it a
 * customer's state + the café's rules + "now", and it returns the new state and
 * everything that happened (XP gained, level-ups, badges, rewards...). That
 * makes every rule easy to test (see engine.test.ts) and identical in demo
 * mode, real mode, and Toast-verified mode.
 *
 * RULES
 * - Every check-in earns XP (+ streak bonus, × event multiplier). XP climbs levels.
 * - Each week the customer must visit `visitsPerWeek` times to keep the streak.
 * - A missed week first uses a streak saver (N per month). Without a saver the
 *   customer drops ONE level per missed week (XP falls to that level's start).
 *   Rewards and badges already earned are never taken away.
 * - Weeks are settled lazily: on the next visit we look back at every week that
 *   ended since last time.
 * - Extras: streak milestones, badges, drink passport stamps, challenges,
 *   limited-time events, mystery dallahs, referrals and squad bonuses.
 */
import type { Badge, Challenge, Level, Program, RewardSpec } from "../program";
import { addDays, diffDays, localDate, localHour, monthKey, weekEnd, weekStart } from "../time";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export type Celebration = {
  id: string;
  type: "level_up" | "badge" | "reward" | "mystery" | "milestone" | "challenge" | "stamp" | "category" | "bonus";
  title: string;
  body: string;
  icon: string;
  at: string;
};

export type MysteryBox = { id: string; earnedAt: string; openedAt?: string; prizeId?: string; prizeName?: string; prizeIcon?: string };

export type GameState = {
  badges: Record<string, string>; // badge key -> ISO time earned
  stamps: Record<string, string>; // menu item id -> local date first tried
  categoriesDone: string[]; // passport categories completed (reward given)
  week: { start: string | null; items: string[]; newItems: string[] };
  challenges: Record<string, string>; // "challengeId@period" -> ISO time completed
  eventVisits: Record<string, number>;
  monthWeeks: { month: string | null; weeks: string[] }; // weeks whose goal was met, per month
  milestones: number[]; // milestone weeks already rewarded (ever)
  referrals: number;
  referralMonth: string | null;
  referralsThisMonth: number;
  referredBy: string | null; // customer id of the friend who referred them
  referralBonusGiven: boolean;
  mystery: MysteryBox[];
  inbox: Celebration[];
  seenAt: string | null;
  lastVisitXp: number; // XP earned on the most recent check-in (for the phone's check-in film)
};

export type StreakState = {
  xp: number;
  streakVisits: number; // visits since the streak last broke (shown as info)
  streakWeeks: number; // consecutive weeks the weekly goal was met
  totalVisits: number; // lifetime, never goes down
  lastVisitAt: string | null;
  lastVisitWeek: string | null;
  weekVisits: number;
  settledWeek: string | null;
  saverMonth: string | null;
  saversUsedInMonth: number;
  birthdayRewardYear: number | null;
  birthdayMonth: number | null;
  birthdayDay: number | null;
  game: GameState;
};

export function newGameState(): GameState {
  return {
    badges: {},
    stamps: {},
    categoriesDone: [],
    week: { start: null, items: [], newItems: [] },
    challenges: {},
    eventVisits: {},
    monthWeeks: { month: null, weeks: [] },
    milestones: [],
    referrals: 0,
    referralMonth: null,
    referralsThisMonth: 0,
    referredBy: null,
    referralBonusGiven: false,
    mystery: [],
    inbox: [],
    seenAt: null,
    lastVisitXp: 0,
  };
}

/** Fills in any missing game fields (e.g. customers created before gamification). */
export function normalizeGame(g: Partial<GameState> | null | undefined): GameState {
  const base = newGameState();
  if (!g) return base;
  return {
    ...base,
    ...g,
    week: { ...base.week, ...(g.week ?? {}) },
    monthWeeks: { ...base.monthWeeks, ...(g.monthWeeks ?? {}) },
  };
}

export function newStreakState(birthday?: { month: number; day: number } | null): StreakState {
  return {
    xp: 0,
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
    game: newGameState(),
  };
}

function clone(s: StreakState): StreakState {
  return { ...s, game: structuredClone(normalizeGame(s.game)) };
}

export type StreakEvent =
  | { type: "saver_used"; week: string }
  | { type: "level_drop"; week: string; fromLevel: string; toLevel: string }
  | { type: "streak_reset"; week: string }
  | { type: "level_up"; toLevel: string }
  | { type: "badge"; key: string }
  | { type: "challenge"; key: string }
  | { type: "milestone"; weeks: number }
  | { type: "stamp"; itemId: string }
  | { type: "mystery_earned"; id: string }
  | { type: "mystery_opened"; id: string; prizeId: string };

export type RewardKind = "welcome" | "level" | "surprise" | "birthday" | "milestone" | "badge" | "challenge" | "passport" | "mystery";
export type RewardGrant = RewardSpec & { kind: RewardKind; levelKey?: string };
export type XpLine = { label: string; xp: number };
export type Clock = { now: Date; timeZone: string };

/** Everything that happened in one action. */
export type Changes = {
  xpLines: XpLine[];
  rewards: RewardGrant[];
  events: StreakEvent[];
  celebrations: Celebration[];
};

const emptyChanges = (): Changes => ({ xpLines: [], rewards: [], events: [], celebrations: [] });

function celebrate(s: StreakState, c: Changes, at: string, cel: Omit<Celebration, "id" | "at">) {
  const full: Celebration = { ...cel, id: `${cel.type}:${at}:${c.celebrations.length}`, at };
  c.celebrations.push(full);
  s.game.inbox = [...s.game.inbox, full].slice(-30);
}

function addXp(s: StreakState, c: Changes, xp: number, label: string) {
  if (xp <= 0) return;
  s.xp += xp;
  c.xpLines.push({ label, xp });
}

// ---------------------------------------------------------------------------
// Levels & progress
// ---------------------------------------------------------------------------

export function levelIndexFor(xp: number, levels: Level[]): number {
  let idx = 0;
  levels.forEach((l, i) => {
    if (xp >= l.minXp) idx = i;
  });
  return idx;
}

/** Typical XP for the next visit (for "about N visits" estimates). */
export function xpPerVisitEstimate(s: Pick<StreakState, "streakWeeks">, program: Program): number {
  const x = program.xp;
  return Math.max(1, x.perVisit + Math.min(x.streakBonusCap, x.perStreakWeek * Math.max(1, s.streakWeeks)));
}

export type Progress = {
  level: Level;
  levelIndex: number;
  isTopLevel: boolean;
  next: Level | null; // the very next level
  xpToNext: number;
  fraction: number; // 0..1 toward `next`
  rewardTarget: Level | null; // next level that gives a reward or perk
  xpToRewardTarget: number;
};

export function progressFor(xp: number, program: Program): Progress {
  const { levels } = program;
  const levelIndex = levelIndexFor(xp, levels);
  const level = levels[levelIndex];
  const next = levels[levelIndex + 1] ?? null;
  const rewardTarget = levels.slice(levelIndex + 1).find((l) => l.reward || l.perk) ?? next;
  return {
    level,
    levelIndex,
    isTopLevel: !next,
    next,
    xpToNext: next ? next.minXp - xp : 0,
    fraction: next ? Math.min(1, (xp - level.minXp) / (next.minXp - level.minXp)) : 1,
    rewardTarget,
    xpToRewardTarget: rewardTarget ? rewardTarget.minXp - xp : 0,
  };
}

// ---------------------------------------------------------------------------
// Events (Ramadan nights, Eid, summer...)
// ---------------------------------------------------------------------------

export function activeEvents(program: Program, clock: Clock) {
  const today = localDate(clock.now, clock.timeZone);
  const hour = localHour(clock.now, clock.timeZone);
  return program.events.filter((e) => {
    if (today < e.start || today > e.end) return false;
    const from = e.fromHour ?? 0;
    const to = e.toHour ?? 24;
    return from <= to ? hour >= from && hour < to : hour >= from || hour < to;
  });
}

/** Events whose dates include today (even if outside today's time window). */
export function currentEvents(program: Program, clock: Clock) {
  const today = localDate(clock.now, clock.timeZone);
  return program.events.filter((e) => today >= e.start && today <= e.end);
}

// ---------------------------------------------------------------------------
// Weekly settlement (savers and drops)
// ---------------------------------------------------------------------------

function hasSomethingToProtect(s: StreakState) {
  return s.xp > 0 || s.streakWeeks > 0;
}

function saverAvailableFor(s: StreakState, program: Program, month: string) {
  if (program.saversPerMonth <= 0) return false;
  return s.saverMonth !== month || s.saversUsedInMonth < program.saversPerMonth;
}

/** Applies every week that has fully ended since we last looked. Never mutates the input. */
export function settle(state: StreakState, program: Program, clock: Clock): { state: StreakState; events: StreakEvent[] } {
  const s = clone(state);
  const events: StreakEvent[] = [];
  const currentWeek = weekStart(localDate(clock.now, clock.timeZone), program.weekStartsOn);
  if (!s.settledWeek) {
    s.settledWeek = currentWeek;
    return { state: s, events };
  }
  for (let w = s.settledWeek; w < currentWeek; w = addDays(w, 7)) {
    const visits = w === s.lastVisitWeek ? s.weekVisits : 0;
    if (visits >= program.visitsPerWeek) continue;
    if (!hasSomethingToProtect(s)) continue;
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
    const i = levelIndexFor(s.xp, program.levels);
    if (i > 0) {
      s.xp = program.levels[i - 1].minXp;
      events.push({ type: "level_drop", week: w, fromLevel: program.levels[i].key, toLevel: program.levels[i - 1].key });
    } else if (s.xp > 0) {
      s.xp = 0;
      events.push({ type: "streak_reset", week: w });
    }
    s.streakWeeks = 0;
    s.streakVisits = 0;
  }
  s.settledWeek = currentWeek;
  return { state: s, events };
}

// ---------------------------------------------------------------------------
// Badges & challenges
// ---------------------------------------------------------------------------

export type GameContext = { clock: Clock; squadStreakWeeks?: number; visitHour?: number };

/** Numeric progress for a badge, or null when it isn't a counting badge. */
export function badgeProgress(b: Badge, s: StreakState, program: Program, ctx: GameContext): { current: number; target: number } | null {
  const g = s.game;
  const r = b.rule;
  switch (r.type) {
    case "streak_weeks":
      return { current: s.streakWeeks, target: r.weeks };
    case "total_visits":
      return { current: s.totalVisits, target: r.count };
    case "distinct_items":
      return { current: Object.keys(g.stamps).length, target: r.count };
    case "category_complete": {
      const items = program.menu.items.filter((i) => i.categoryId === r.categoryId);
      return { current: items.filter((i) => g.stamps[i.id]).length, target: Math.max(1, items.length) };
    }
    case "referrals":
      return { current: g.referrals, target: r.count };
    case "event_visits":
      return { current: g.eventVisits[r.eventId] ?? 0, target: r.count };
    case "squad_weeks":
      return { current: ctx.squadStreakWeeks ?? 0, target: r.weeks };
    case "level_reached": {
      const lvl = program.levels.find((l) => l.key === r.levelKey);
      return lvl ? { current: Math.min(s.xp, lvl.minXp), target: Math.max(1, lvl.minXp) } : null;
    }
    default:
      return null;
  }
}

function weekStartsInMonth(month: string, weekStartsOn: number): string[] {
  const first = `${month}-01`;
  let w = weekStart(first, weekStartsOn);
  if (w < first) w = addDays(w, 7);
  const out: string[] = [];
  for (; w.slice(0, 7) === month; w = addDays(w, 7)) out.push(w);
  return out;
}

function badgeEarned(b: Badge, s: StreakState, program: Program, ctx: GameContext): boolean {
  const r = b.rule;
  if (r.type === "visit_before_hour") return ctx.visitHour !== undefined && ctx.visitHour < r.hour;
  if (r.type === "visit_after_hour") return ctx.visitHour !== undefined && ctx.visitHour >= r.hour;
  if (r.type === "perfect_month") {
    const m = s.game.monthWeeks;
    if (!m.month) return false;
    const needed = weekStartsInMonth(m.month, program.weekStartsOn);
    return needed.length > 0 && needed.every((w) => m.weeks.includes(w));
  }
  const p = badgeProgress(b, s, program, ctx);
  return p !== null && p.current >= p.target;
}

export function challengePeriodKey(ch: Challenge, s: StreakState, program: Program, clock: Clock): string | null {
  if (ch.period === "weekly") return weekStart(localDate(clock.now, clock.timeZone), program.weekStartsOn);
  if (ch.period === "once") return "once";
  const ev = program.events.find((e) => e.id === ch.eventId);
  const today = localDate(clock.now, clock.timeZone);
  return ev && today >= ev.start && today <= ev.end ? ev.id : null;
}

export type ChallengeStatus = { challenge: Challenge; current: number; target: number; done: boolean; periodKey: string };

/** Challenges that are running right now, with progress. */
export function challengeStatuses(s: StreakState, program: Program, clock: Clock): ChallengeStatus[] {
  const g = normalizeGame(s.game);
  const thisWeek = weekStart(localDate(clock.now, clock.timeZone), program.weekStartsOn);
  const weekItems = g.week.start === thisWeek ? g.week.items : [];
  const weekNew = g.week.start === thisWeek ? g.week.newItems : [];
  const out: ChallengeStatus[] = [];
  for (const ch of program.challenges) {
    if (!ch.active) continue;
    const periodKey = challengePeriodKey(ch, s, program, clock);
    if (!periodKey) continue;
    let current = 0;
    let target = 1;
    const goal = ch.goal;
    if (goal.type === "visits") {
      target = goal.count;
      current = ch.period === "weekly" ? (s.lastVisitWeek === thisWeek ? s.weekVisits : 0) : ch.period === "event" ? (g.eventVisits[periodKey] ?? 0) : s.totalVisits;
    } else if (goal.type === "try_category") {
      target = goal.count;
      const inCat = new Set(program.menu.items.filter((i) => i.categoryId === goal.categoryId).map((i) => i.id));
      const pool = ch.period === "once" ? Object.keys(g.stamps) : weekItems;
      current = new Set(pool.filter((i) => inCat.has(i))).size;
    } else if (goal.type === "try_item") {
      current = (ch.period === "once" ? Boolean(g.stamps[goal.itemId]) : weekItems.includes(goal.itemId)) ? 1 : 0;
    } else if (goal.type === "try_new") {
      target = goal.count;
      current = ch.period === "once" ? Object.keys(g.stamps).length : weekNew.length;
    }
    const done = Boolean(g.challenges[`${ch.id}@${periodKey}`]) || current >= target;
    out.push({ challenge: ch, current: Math.min(current, target), target, done, periodKey });
  }
  return out;
}

/**
 * Runs after any change: completes challenges, awards badges, handles
 * level-ups (repeating, since badge XP can cause another level-up).
 */
function finalize(s: StreakState, c: Changes, program: Program, ctx: GameContext, levelBefore: number) {
  const at = ctx.clock.now.toISOString();
  for (const st of challengeStatuses(s, program, ctx.clock)) {
    const key = `${st.challenge.id}@${st.periodKey}`;
    if (st.current >= st.target && !s.game.challenges[key]) {
      s.game.challenges[key] = at;
      c.events.push({ type: "challenge", key });
      addXp(s, c, st.challenge.xp, `Challenge: ${st.challenge.title}`);
      if (st.challenge.reward) c.rewards.push({ ...st.challenge.reward, kind: "challenge" });
      celebrate(s, c, at, { type: "challenge", title: "Challenge complete!", body: st.challenge.title + (st.challenge.reward ? ` · ${st.challenge.reward.name}` : ""), icon: st.challenge.icon });
    }
  }
  let reached = levelBefore;
  for (let round = 0; round < 5; round++) {
    let changed = false;
    for (const b of program.badges) {
      if (s.game.badges[b.key] || !badgeEarned(b, s, program, ctx)) continue;
      s.game.badges[b.key] = at;
      c.events.push({ type: "badge", key: b.key });
      addXp(s, c, b.xp, `Badge: ${b.name}`);
      if (b.reward) c.rewards.push({ ...b.reward, kind: "badge" });
      celebrate(s, c, at, { type: "badge", title: "New badge!", body: b.name, icon: b.icon });
      changed = true;
    }
    const now = levelIndexFor(s.xp, program.levels);
    for (let i = reached + 1; i <= now; i++) {
      const level = program.levels[i];
      c.events.push({ type: "level_up", toLevel: level.key });
      if (level.reward) c.rewards.push({ ...level.reward, kind: "level", levelKey: level.key });
      celebrate(s, c, at, {
        type: "level_up",
        title: `You're now ${level.name}!`,
        body: [level.reward?.name, level.perk].filter(Boolean).join(" · ") || "Keep the streak going",
        icon: level.icon,
      });
      changed = true;
    }
    reached = Math.max(reached, now);
    if (!changed) break;
  }
  for (const r of c.rewards) {
    if (["level", "challenge", "badge", "milestone", "passport", "mystery"].includes(r.kind)) continue; // celebrated already
    celebrate(s, c, at, { type: "reward", title: "Reward unlocked!", body: r.name, icon: "🎁" });
  }
}

// ---------------------------------------------------------------------------
// Check-in
// ---------------------------------------------------------------------------

export type CheckInOutcome =
  | { ok: false; reason: "cooldown"; nextAllowedAt: Date; lastVisitAt: Date }
  | ({
      ok: true;
      before: StreakState; // after settling, before this visit
      state: StreakState; // after this visit
      visit: { localDate: string; weekStart: string; xp: number };
      xpGained: number;
    } & Changes);

function birthdayIn(year: number, month: number, day: number): string {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

/** Returns the birthday year if `today` is within the birthday window. */
export function birthdayWindowYear(s: Pick<StreakState, "birthdayMonth" | "birthdayDay">, today: string, windowDays: number): number | null {
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
  ctx: { squadStreakWeeks?: number } = {},
): CheckInOutcome {
  // 1) Anti-cheat: one check-in per phone per cooldown window.
  if (state.lastVisitAt) {
    const last = new Date(state.lastVisitAt);
    const nextAllowedAt = new Date(last.getTime() + program.cooldownMinutes * 60_000);
    if (clock.now < nextAllowedAt) return { ok: false, reason: "cooldown", nextAllowedAt, lastVisitAt: last };
  }

  // 2) Settle any weeks that ended since the last visit.
  const settled = settle(state, program, clock);
  const before = settled.state;
  const s = clone(before);
  const c = emptyChanges();
  c.events.push(...settled.events);
  const at = clock.now.toISOString();
  const today = localDate(clock.now, clock.timeZone);
  const week = weekStart(today, program.weekStartsOn);
  const levelBefore = levelIndexFor(before.xp, program.levels);
  const g = s.game;

  // 3) Count the visit.
  if (s.lastVisitWeek !== week) {
    s.lastVisitWeek = week;
    s.weekVisits = 0;
  }
  if (g.week.start !== week) g.week = { start: week, items: [], newItems: [] };
  s.weekVisits += 1;
  s.totalVisits += 1;
  s.streakVisits += 1;
  s.lastVisitAt = at;
  let weekCompleted = false;
  if (s.weekVisits === program.visitsPerWeek) {
    s.streakWeeks += 1;
    weekCompleted = true;
    const m = monthKey(week);
    if (g.monthWeeks.month !== m) g.monthWeeks = { month: m, weeks: [] };
    g.monthWeeks.weeks.push(week);
  }

  // 4) XP: base + streak bonus, multiplied during events.
  const x = program.xp;
  const base = x.perVisit;
  const streakBonus = Math.min(x.streakBonusCap, x.perStreakWeek * s.streakWeeks);
  addXp(s, c, base, "Check-in");
  addXp(s, c, streakBonus, `${s.streakWeeks}-week streak bonus`);
  const events = activeEvents(program, clock);
  for (const e of currentEvents(program, clock)) {
    if (events.includes(e)) g.eventVisits[e.id] = (g.eventVisits[e.id] ?? 0) + 1;
  }
  const mult = Math.max(1, ...events.map((e) => e.xpMultiplier));
  if (mult > 1) {
    const ev = events.find((e) => e.xpMultiplier === mult)!;
    addXp(s, c, Math.round((base + streakBonus) * (mult - 1)), `${ev.icon} ${ev.name} ×${mult}`);
  }

  // 5) Streak milestones (4, 8, 12, 26, 52 weeks): bonus XP + reward, once ever.
  if (weekCompleted) {
    for (const m of program.milestones) {
      if (s.streakWeeks === m.weeks && !g.milestones.includes(m.weeks)) {
        g.milestones.push(m.weeks);
        c.events.push({ type: "milestone", weeks: m.weeks });
        addXp(s, c, m.xp, `${m.weeks}-week milestone`);
        if (m.reward) c.rewards.push({ ...m.reward, kind: "milestone" });
        celebrate(s, c, at, { type: "milestone", title: `${m.weeks}-week streak!`, body: m.reward ? `Bonus: ${m.reward.name}` : `+${m.xp} XP`, icon: "🔥" });
      }
    }
  }

  // 6) Welcome & birthday rewards.
  const welcome = program.welcomeReward;
  if (welcome?.enabled && s.totalVisits === welcome.onVisit) {
    c.rewards.push({ name: welcome.name, valueCents: welcome.valueCents, costCents: welcome.costCents, kind: "welcome" });
  }
  const bday = program.birthdayReward;
  if (bday?.enabled) {
    const year = birthdayWindowYear(s, today, bday.windowDays);
    if (year !== null && s.birthdayRewardYear !== year) {
      s.birthdayRewardYear = year;
      c.rewards.push({ name: bday.name, valueCents: bday.valueCents, costCents: bday.costCents, kind: "birthday" });
    }
  }

  // 7) Referral: the new member's first visit gives them bonus XP.
  if (program.referral.enabled && s.totalVisits === 1 && g.referredBy && !g.referralBonusGiven) {
    g.referralBonusGiven = true;
    addXp(s, c, program.referral.xp, "Friend referral bonus");
  }

  // 8) Mystery dallah (opened later on the customer's phone).
  const mys = program.mystery;
  if (mys.enabled && mys.prizes.length) {
    const nth = mys.everyNthVisit > 0 && s.totalVisits % mys.everyNthVisit === 0;
    if (nth || (mys.chance > 0 && random() < mys.chance)) {
      const id = `m${s.totalVisits}-${at}`;
      g.mystery = [...g.mystery, { id, earnedAt: at }].slice(-20);
      c.events.push({ type: "mystery_earned", id });
    }
  }

  // 9) Challenges, badges, level-ups.
  finalize(s, c, program, { clock, squadStreakWeeks: ctx.squadStreakWeeks, visitHour: localHour(clock.now, clock.timeZone) }, levelBefore);

  const xpGained = c.xpLines.reduce((a, l) => a + l.xp, 0);
  s.game.lastVisitXp = xpGained;
  return { ok: true, before, state: s, visit: { localDate: today, weekStart: week, xp: xpGained }, xpGained, ...c };
}

// ---------------------------------------------------------------------------
// Drink passport
// ---------------------------------------------------------------------------

/** Records what the customer ordered: new items become passport stamps. */
export function stampItems(state: StreakState, program: Program, itemIds: string[], clock: Clock, ctx: { squadStreakWeeks?: number } = {}) {
  const s = clone(state);
  const c = emptyChanges();
  const g = s.game;
  const at = clock.now.toISOString();
  const today = localDate(clock.now, clock.timeZone);
  const week = weekStart(today, program.weekStartsOn);
  const levelBefore = levelIndexFor(s.xp, program.levels);
  if (g.week.start !== week) g.week = { start: week, items: [], newItems: [] };
  const known = new Map(program.menu.items.map((i) => [i.id, i]));
  for (const id of new Set(itemIds)) {
    const item = known.get(id);
    if (!item) continue;
    if (!g.week.items.includes(id)) g.week.items.push(id);
    if (g.stamps[id]) continue;
    g.stamps[id] = today;
    g.week.newItems.push(id);
    c.events.push({ type: "stamp", itemId: id });
    addXp(s, c, program.xp.newItem, `New stamp: ${item.name}`);
    celebrate(s, c, at, { type: "stamp", title: "New passport stamp!", body: item.name, icon: item.icon });
    const cat = program.menu.categories.find((k) => k.id === item.categoryId);
    const catItems = program.menu.items.filter((i) => i.categoryId === item.categoryId);
    if (cat && !g.categoriesDone.includes(cat.id) && catItems.every((i) => g.stamps[i.id])) {
      g.categoriesDone.push(cat.id);
      if (cat.reward) c.rewards.push({ ...cat.reward, kind: "passport" });
      celebrate(s, c, at, { type: "category", title: `${cat.name} complete!`, body: cat.reward ? cat.reward.name : "Page complete", icon: cat.icon });
    }
  }
  finalize(s, c, program, { clock, squadStreakWeeks: ctx.squadStreakWeeks }, levelBefore);
  return { state: s, ...c };
}

// ---------------------------------------------------------------------------
// Mystery dallah
// ---------------------------------------------------------------------------

/**
 * Opens a mystery box. Prizes that cost money are only possible while the
 * café's monthly mystery budget has room; XP prizes are always possible.
 */
export function openMystery(state: StreakState, program: Program, boxId: string, budgetLeftCents: number, clock: Clock, random: () => number = Math.random) {
  const s = clone(state);
  const c = emptyChanges();
  const box = s.game.mystery.find((b) => b.id === boxId);
  if (!box || box.openedAt) return null;
  const eligible = program.mystery.prizes.filter((p) => p.weight > 0 && (p.costCents === 0 || p.costCents <= budgetLeftCents));
  const pool = eligible.length ? eligible : [{ id: "xp-fallback", name: "+100 bonus XP", icon: "⚡", weight: 1, valueCents: 0, costCents: 0, xp: 100 }];
  const total = pool.reduce((a, p) => a + p.weight, 0);
  let roll = random() * total;
  let prize = pool[pool.length - 1];
  for (const p of pool) {
    roll -= p.weight;
    if (roll < 0) {
      prize = p;
      break;
    }
  }
  const levelBefore = levelIndexFor(s.xp, program.levels);
  const at = clock.now.toISOString();
  Object.assign(box, { openedAt: at, prizeId: prize.id, prizeName: prize.name, prizeIcon: prize.icon });
  c.events.push({ type: "mystery_opened", id: boxId, prizeId: prize.id });
  addXp(s, c, prize.xp, `Mystery: ${prize.name}`);
  if (prize.valueCents > 0 || prize.costCents > 0) c.rewards.push({ name: prize.name, valueCents: prize.valueCents, costCents: prize.costCents, kind: "mystery" });
  finalize(s, c, program, { clock }, levelBefore);
  return { state: s, prize, ...c };
}

// ---------------------------------------------------------------------------
// Bonus XP from outside a visit (referrer bonus, squad week)
// ---------------------------------------------------------------------------

export function awardBonus(
  state: StreakState,
  program: Program,
  bonus: { xp: number; label: string; referral?: boolean },
  clock: Clock,
  ctx: { squadStreakWeeks?: number } = {},
) {
  const s = clone(state);
  const c = emptyChanges();
  const g = s.game;
  const levelBefore = levelIndexFor(s.xp, program.levels);
  let xp = bonus.xp;
  if (bonus.referral) {
    const month = monthKey(localDate(clock.now, clock.timeZone));
    if (g.referralMonth !== month) {
      g.referralMonth = month;
      g.referralsThisMonth = 0;
    }
    g.referrals += 1;
    g.referralsThisMonth += 1;
    if (g.referralsThisMonth > program.referral.maxPerMonth) xp = 0; // still counts for the badge
  }
  addXp(s, c, xp, bonus.label);
  if (xp > 0) celebrate(s, c, clock.now.toISOString(), { type: "bonus", title: `+${xp} XP`, body: bonus.label, icon: "⚡" });
  finalize(s, c, program, { clock, squadStreakWeeks: ctx.squadStreakWeeks }, levelBefore);
  return { state: s, ...c };
}

// ---------------------------------------------------------------------------
// Status helpers used for messages
// ---------------------------------------------------------------------------

export function weekGoalMet(s: StreakState, program: Program, clock: Clock): boolean {
  const week = weekStart(localDate(clock.now, clock.timeZone), program.weekStartsOn);
  return s.lastVisitWeek === week && s.weekVisits >= program.visitsPerWeek;
}

/** The last day the customer can visit to keep the streak going. */
export function nextDeadline(s: StreakState, program: Program, clock: Clock): string {
  const end = weekEnd(localDate(clock.now, clock.timeZone), program.weekStartsOn);
  return weekGoalMet(s, program, clock) ? addDays(end, 7) : end;
}

export type StreakRisk = { endsOn: string; daysLeft: number; atRiskCents: number; saverWillCover: boolean };

/** Is the streak about to end? Only when the deadline is today/tomorrow and the goal isn't met. */
export function streakRisk(state: StreakState, program: Program, clock: Clock): StreakRisk | null {
  const { state: s } = settle(state, program, clock);
  if (!hasSomethingToProtect(s) || weekGoalMet(s, program, clock)) return null;
  const today = localDate(clock.now, clock.timeZone);
  const endsOn = weekEnd(today, program.weekStartsOn);
  const daysLeft = diffDays(today, endsOn);
  if (daysLeft > 1) return null;
  const p = progressFor(s.xp, program);
  const bestReward = Math.max(0, ...program.levels.map((l) => l.reward?.valueCents ?? 0));
  const atRiskCents = p.rewardTarget?.reward?.valueCents ?? p.level.reward?.valueCents ?? bestReward;
  return { endsOn, daysLeft, atRiskCents, saverWillCover: saverAvailableFor(s, program, monthKey(endsOn)) };
}
