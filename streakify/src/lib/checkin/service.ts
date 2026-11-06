/**
 * GAME SERVICE: glues the engine, storage and side effects together.
 *
 *   check-in:  phone -> customer -> engine -> save -> result for the tablet
 *   stamps:    "what did you have?" -> passport stamps
 *   mystery:   open a mystery dallah on the phone (respects the monthly budget)
 *   squads, referrals, "seen" celebrations
 *
 * Every save goes through `saveChange`, which retries if two actions touch the
 * same customer at once, and afterwards refreshes their Wallet passes.
 */
import "server-only";
import { getRepo, ConflictError, DuplicatePhoneError, type Cafe, type Customer, type Reward } from "../data";
import { formatMoney } from "../money";
import { PRIVACY_VERSION, smsConsentText } from "../privacy";
import {
  type Changes,
  type Clock,
  type StreakState,
  awardBonus,
  checkIn,
  levelIndexFor,
  openMystery,
  progressFor,
  stampItems,
} from "../streak/engine";
import { eventLines, nextTimeLine, progressLine, riskLine, savedTodayLine, totalSavedLine } from "../streak/messages";
import { addDays, formatTime, localDate, monthRange, weekStart } from "../time";
import { verifyVisitInBackground } from "../pos";
import { refreshWalletPassesLater } from "../wallet";

const clockFor = (cafe: Cafe, now: Date): Clock => ({ now, timeZone: cafe.timezone });

type Result<T> = { ok: true; value: T } | { ok: false; reason: string };

/**
 * Loads the customer, runs `change` on their state and saves atomically.
 * Retries on conflicts (two taps at once). `change` returns null to skip.
 */
async function saveChange<T extends Changes & { state: StreakState }>(
  cafe: Cafe,
  customerId: string,
  now: Date,
  change: (c: Customer) => T | null | { refused: string },
  visitFor?: (c: Customer, out: T) => NonNullable<Parameters<ReturnType<typeof getRepo>["applyUpdate"]>[0]["visit"]>,
): Promise<Result<{ out: T; customer: Customer; before: Customer; visitId: string | null }>> {
  const repo = getRepo();
  for (let attempt = 0; attempt < 4; attempt++) {
    const customer = await repo.getCustomer(cafe.id, customerId);
    if (!customer) return { ok: false, reason: "Customer not found." };
    const out = change(customer);
    if (!out) return { ok: false, reason: "Nothing to do." };
    if ("refused" in out) return { ok: false, reason: out.refused };
    try {
      const { visitId } = await repo.applyUpdate({
        cafeId: cafe.id,
        customerId,
        expectedVersion: customer.version,
        state: out.state,
        meta: { createdAt: now.toISOString(), localDate: localDate(now, cafe.timezone) },
        visit: visitFor ? visitFor(customer, out) : null,
        rewards: out.rewards,
        events: out.events,
      });
      const updated: Customer = { ...customer, ...out.state, version: customer.version + 1 };
      refreshWalletPassesLater(cafe, updated);
      return { ok: true, value: { out, customer: updated, before: customer, visitId } };
    } catch (e) {
      if (e instanceof ConflictError) continue;
      throw e;
    }
  }
  return { ok: false, reason: "Busy, please try again." };
}

// ---------------------------------------------------------------------------
// The tablet result screen
// ---------------------------------------------------------------------------

export type RewardView = { id: string; name: string; valueLabel: string; kind: Reward["kind"]; isNew: boolean };

export type CheckInView = {
  customerId: string;
  publicToken: string;
  personalUrl?: string;
  qrSvg?: string;
  firstName: string;
  isNewMember: boolean;
  levelName: string;
  levelIcon: string;
  levelPerk: string | null;
  leveledUpTo: string | null;
  xp: number;
  xpGained: number;
  xpLines: { label: string; xp: number }[];
  streakWeeks: number;
  badgesEarned: { name: string; icon: string }[];
  mysteryEarned: boolean;
  progress: { fraction: number; line: string };
  rewards: RewardView[];
  savedTodayCents: number;
  menu: { id: string; name: string; icon: string; stamped: boolean }[];
  lines: { savedToday: string | null; nextTime: string; totalSaved: string; events: string[]; risk: string | null };
};

export type CheckInResult =
  | { status: "ok"; view: CheckInView }
  | { status: "cooldown"; message: string }
  | { status: "new"; phone: string }
  | { status: "error"; message: string };

async function buildView(
  cafe: Cafe,
  c: Customer,
  now: Date,
  ctx: { out: ReturnType<typeof checkIn> & { ok: true }; earnedBefore: Set<string>; isNewMember: boolean },
): Promise<CheckInView> {
  const repo = getRepo();
  const today = localDate(now, cafe.timezone);
  const [available, savings] = await Promise.all([repo.listAvailableRewards(cafe.id, c.id), repo.savings(cafe.id, c.id, today)]);
  const p = progressFor(c.xp, cafe.program);
  const leveled = [...ctx.out.events].reverse().find((e) => e.type === "level_up");
  const badgeKeys = ctx.out.events.filter((e) => e.type === "badge").map((e) => (e as { key: string }).key);
  return {
    customerId: c.id,
    publicToken: c.publicToken,
    firstName: c.firstName,
    isNewMember: ctx.isNewMember,
    levelName: p.level.name,
    levelIcon: p.level.icon,
    levelPerk: p.level.perk ?? null,
    leveledUpTo: leveled ? p.level.name : null,
    xp: c.xp,
    xpGained: ctx.out.xpGained,
    xpLines: ctx.out.xpLines,
    streakWeeks: c.streakWeeks,
    badgesEarned: cafe.program.badges.filter((b) => badgeKeys.includes(b.key)).map((b) => ({ name: b.name, icon: b.icon })),
    mysteryEarned: ctx.out.events.some((e) => e.type === "mystery_earned"),
    progress: { fraction: p.fraction, line: progressLine(c, cafe.program) },
    rewards: available.map((r) => ({
      id: r.id,
      name: r.name,
      valueLabel: formatMoney(r.valueCents, cafe.currency),
      kind: r.kind,
      isNew: !ctx.earnedBefore.has(r.id),
    })),
    savedTodayCents: savings.todayCents,
    menu: cafe.program.menu.items.map((i) => ({ id: i.id, name: i.name, icon: i.icon, stamped: Boolean(c.game.stamps[i.id]) })),
    lines: {
      savedToday: savedTodayLine(savings.todayCents, cafe.currency),
      nextTime: nextTimeLine(c, cafe.program, clockFor(cafe, now), cafe.currency),
      totalSaved: totalSavedLine(savings.totalCents, cafe.currency),
      events: eventLines(ctx.out.events, cafe.program),
      risk: riskLine(c, cafe.program, clockFor(cafe, now), cafe.currency),
    },
  };
}

// ---------------------------------------------------------------------------
// Check-in
// ---------------------------------------------------------------------------

async function squadStreakFor(cafe: Cafe, c: Customer): Promise<number | undefined> {
  if (!c.squadId) return undefined;
  return (await getRepo().getSquad(cafe.id, c.squadId))?.streakWeeks;
}

export async function checkInCustomer(cafe: Cafe, customerId: string, now = new Date(), isNewMember = false): Promise<CheckInResult> {
  const repo = getRepo();
  const pre = await repo.getCustomer(cafe.id, customerId);
  if (!pre) return { status: "error", message: "Customer not found." };
  const [earnedBefore, squadStreak] = await Promise.all([
    repo.listAvailableRewards(cafe.id, customerId).then((r) => new Set(r.map((x) => x.id))),
    squadStreakFor(cafe, pre),
  ]);

  let cooldown: string | null = null;
  const saved = await saveChange(
    cafe,
    customerId,
    now,
    (c) => {
      const out = checkIn(c, cafe.program, clockFor(cafe, now), Math.random, { squadStreakWeeks: squadStreak });
      if (!out.ok) {
        cooldown = `${c.firstName}, you already checked in at ${formatTime(out.lastVisitAt, cafe.timezone)}. You can check in again after ${formatTime(out.nextAllowedAt, cafe.timezone)}.`;
        return { refused: cooldown };
      }
      return out;
    },
    (_c, out) => ({
      createdAt: now.toISOString(),
      localDate: out.visit.localDate,
      weekStart: out.visit.weekStart,
      source: "counter",
      streakVisitsAfter: out.state.streakVisits,
      levelAfter: cafe.program.levels[levelIndexFor(out.state.xp, cafe.program.levels)].key,
      xp: out.xpGained,
    }),
  );
  if (!saved.ok) return cooldown ? { status: "cooldown", message: cooldown } : { status: "error", message: saved.reason };
  const { out, customer, visitId } = saved.value;
  if (visitId) verifyVisitInBackground(cafe, visitId, now, customer.phone);

  // Side quests that touch OTHER customers (after the response is built is fine,
  // but they're quick, so we just await them).
  await Promise.all([rewardReferrer(cafe, customer, now), updateSquad(cafe, customer, now)]);

  const view = await buildView(cafe, customer, now, { out: out as ReturnType<typeof checkIn> & { ok: true }, earnedBefore, isNewMember });
  return { status: "ok", view };
}

/** When a referred friend checks in for the first time, the referrer gets bonus XP too. */
async function rewardReferrer(cafe: Cafe, friend: Customer, now: Date) {
  const ref = cafe.program.referral;
  if (!ref.enabled || friend.totalVisits !== 1 || !friend.game.referredBy) return;
  await saveChange(cafe, friend.game.referredBy, now, (c) =>
    awardBonus(c, cafe.program, { xp: ref.xp, label: `${friend.firstName} joined with your code`, referral: true }, clockFor(cafe, now)),
  );
}

/** If every squad member has hit this week's goal, extend the squad streak and give everyone bonus XP. */
async function updateSquad(cafe: Cafe, c: Customer, now: Date) {
  const sq = cafe.program.squads;
  if (!sq.enabled || !c.squadId) return;
  const repo = getRepo();
  const week = weekStart(localDate(now, cafe.timezone), cafe.program.weekStartsOn);
  const members = await repo.listSquadMembers(cafe.id, c.squadId);
  if (members.length < 2) return;
  const allDone = members.every((m) => m.lastVisitWeek === week && m.weekVisits >= cafe.program.visitsPerWeek);
  if (!allDone) return;
  const streak = await repo.completeSquadWeek(c.squadId, week);
  if (streak === null) return; // someone else already completed it
  await Promise.all(
    members.map((m) =>
      saveChange(cafe, m.id, now, (cur) =>
        awardBonus(cur, cafe.program, { xp: sq.xpPerWeek, label: `Squad week complete (${streak}-week squad streak)` }, clockFor(cafe, now), { squadStreakWeeks: streak }),
      ),
    ),
  );
}

export async function checkInByPhone(cafe: Cafe, phone: string, now = new Date()): Promise<CheckInResult> {
  const customer = await getRepo().findCustomerByPhone(cafe.id, phone);
  if (!customer) return { status: "new", phone };
  return checkInCustomer(cafe, customer.id, now);
}

/** Wallet pass / QR scan at the counter. */
export async function checkInByToken(cafe: Cafe, token: string, now = new Date()): Promise<CheckInResult> {
  const customer = await getRepo().getCustomerByToken(cafe.id, token);
  if (!customer) return { status: "error", message: "That pass isn't from this café." };
  return checkInCustomer(cafe, customer.id, now);
}

export type SignUpInput = {
  phone: string;
  firstName: string;
  birthdayMonth: number | null;
  birthdayDay: number | null;
  smsOptIn: boolean;
  leaderboardOptIn: boolean;
  friendCode: string | null;
};

export async function signUpAndCheckIn(cafe: Cafe, input: SignUpInput, now = new Date()): Promise<CheckInResult> {
  const repo = getRepo();
  let referredBy: string | null = null;
  if (input.friendCode && cafe.program.referral.enabled) {
    const friend = await repo.findCustomerByReferralCode(cafe.id, input.friendCode.trim());
    if (!friend) return { status: "error", message: "That friend code wasn't found. Check it, or leave it empty." };
    referredBy = friend.id;
  }
  let customerId: string;
  try {
    const c = await repo.createCustomer({
      cafeId: cafe.id,
      phone: input.phone,
      firstName: input.firstName,
      birthdayMonth: input.birthdayMonth,
      birthdayDay: input.birthdayDay,
      privacyVersion: PRIVACY_VERSION,
      smsOptIn: input.smsOptIn,
      smsConsentText: input.smsOptIn ? smsConsentText(cafe.name) : null,
      leaderboardOptIn: input.leaderboardOptIn,
      referredBy,
      now,
    });
    customerId = c.id;
  } catch (e) {
    if (!(e instanceof DuplicatePhoneError)) throw e;
    const existing = await repo.findCustomerByPhone(cafe.id, input.phone);
    if (!existing) throw e;
    return checkInCustomer(cafe, existing.id, now);
  }
  return checkInCustomer(cafe, customerId, now, true);
}

// ---------------------------------------------------------------------------
// Drink passport (tablet, right after check-in)
// ---------------------------------------------------------------------------

const STAMP_WINDOW_MINUTES = 30;

export async function recordItems(cafe: Cafe, customerId: string, itemIds: string[], now = new Date()) {
  const squad = await getRepo().getCustomer(cafe.id, customerId).then((c) => (c ? squadStreakFor(cafe, c) : undefined));
  const saved = await saveChange(cafe, customerId, now, (c) => {
    if (!c.lastVisitAt || now.getTime() - new Date(c.lastVisitAt).getTime() > STAMP_WINDOW_MINUTES * 60_000) {
      return { refused: "Stamps can only be added right after a check-in." };
    }
    return stampItems(c, cafe.program, itemIds, clockFor(cafe, now), { squadStreakWeeks: squad });
  });
  if (!saved.ok) return { ok: false as const, message: saved.reason };
  const { out } = saved.value;
  return {
    ok: true as const,
    newStamps: out.events.filter((e) => e.type === "stamp").length,
    xp: out.xpLines.reduce((a, l) => a + l.xp, 0),
    rewards: out.rewards.map((r) => r.name),
  };
}

// ---------------------------------------------------------------------------
// Mystery dallah (customer's phone)
// ---------------------------------------------------------------------------

export async function mysteryBudgetLeft(cafe: Cafe, now = new Date()): Promise<number> {
  const { from, to } = monthRange(localDate(now, cafe.timezone));
  const rows = await getRepo().listRewardActivity(cafe.id, from, to);
  const spent = rows.filter((r) => r.kind === "mystery" && r.earnedLocalDate >= from).reduce((a, r) => a + r.costCents, 0);
  return Math.max(0, cafe.program.mystery.monthlyBudgetCents - spent);
}

export async function openMysteryBox(cafe: Cafe, customerId: string, boxId: string, now = new Date()) {
  const budget = await mysteryBudgetLeft(cafe, now);
  const saved = await saveChange(cafe, customerId, now, (c) => openMystery(c, cafe.program, boxId, budget, clockFor(cafe, now)) ?? { refused: "Already opened." });
  if (!saved.ok) return { ok: false as const, message: saved.reason };
  const { out, customer } = saved.value;
  const p = progressFor(customer.xp, cafe.program);
  return {
    ok: true as const,
    prize: { name: out.prize.name, icon: out.prize.icon, xp: out.prize.xp, valueLabel: out.prize.valueCents ? formatMoney(out.prize.valueCents, cafe.currency) : null },
    leveledUp: out.events.some((e) => e.type === "level_up") ? p.level.name : null,
  };
}

/** Marks celebrations as seen so they don't replay on the phone. */
export async function markCelebrationsSeen(cafe: Cafe, customerId: string, upTo: string, now = new Date()) {
  await saveChange(cafe, customerId, now, (c) => {
    if (c.game.seenAt && c.game.seenAt >= upTo) return null;
    return { state: { ...c, game: { ...c.game, seenAt: upTo } }, xpLines: [], rewards: [], events: [], celebrations: [] };
  });
}

// ---------------------------------------------------------------------------
// Squads (customer's phone)
// ---------------------------------------------------------------------------

function squadCode() {
  const abc = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 5 }, () => abc[Math.floor(Math.random() * abc.length)]).join("");
}

export async function createSquadFor(cafe: Cafe, customerId: string, name: string) {
  const repo = getRepo();
  const c = await repo.getCustomer(cafe.id, customerId);
  if (!c) return { ok: false as const, message: "Not found" };
  if (c.squadId) return { ok: false as const, message: "Leave your current squad first." };
  for (let i = 0; i < 5; i++) {
    try {
      const squad = await repo.createSquad(cafe.id, name.trim().slice(0, 24) || `${c.firstName}'s squad`, squadCode());
      await repo.setCustomerSquad(cafe.id, c.id, squad.id);
      return { ok: true as const, code: squad.code };
    } catch (e) {
      if (!(e instanceof Error && e.message === "Code taken")) throw e;
    }
  }
  return { ok: false as const, message: "Try again" };
}

export async function joinSquad(cafe: Cafe, customerId: string, code: string) {
  const repo = getRepo();
  const [c, squad] = await Promise.all([repo.getCustomer(cafe.id, customerId), repo.getSquadByCode(cafe.id, code.trim())]);
  if (!c) return { ok: false as const, message: "Not found" };
  if (!squad) return { ok: false as const, message: "No squad with that code." };
  if (c.squadId) return { ok: false as const, message: "Leave your current squad first." };
  const members = await repo.listSquadMembers(cafe.id, squad.id);
  if (members.length >= cafe.program.squads.maxMembers) return { ok: false as const, message: "That squad is full." };
  await repo.setCustomerSquad(cafe.id, c.id, squad.id);
  return { ok: true as const };
}

export async function leaveSquad(cafe: Cafe, customerId: string) {
  await getRepo().setCustomerSquad(cafe.id, customerId, null);
}

export type SquadView = {
  name: string;
  code: string;
  streakWeeks: number;
  members: { firstName: string; doneThisWeek: boolean; isYou: boolean }[];
};

export async function squadView(cafe: Cafe, c: Customer, now = new Date()): Promise<SquadView | null> {
  if (!c.squadId) return null;
  const repo = getRepo();
  const [squad, members] = await Promise.all([repo.getSquad(cafe.id, c.squadId), repo.listSquadMembers(cafe.id, c.squadId)]);
  if (!squad) return null;
  const week = weekStart(localDate(now, cafe.timezone), cafe.program.weekStartsOn);
  // A streak is alive if the last completed week was this week or last week.
  const alive = squad.lastCompleteWeek === week || squad.lastCompleteWeek === addDays(week, -7);
  return {
    name: squad.name,
    code: squad.code,
    streakWeeks: alive ? squad.streakWeeks : 0,
    members: members.map((m) => ({ firstName: m.firstName, doneThisWeek: m.lastVisitWeek === week && m.weekVisits >= cafe.program.visitsPerWeek, isYou: m.id === c.id })),
  };
}

// ---------------------------------------------------------------------------
// Redeeming rewards (tablet)
// ---------------------------------------------------------------------------

export type RedeemResult =
  | { status: "ok"; redeemedName: string; valueLabel: string; savedTodayCents: number; savedToday: string | null; totalSaved: string; remainingIds: string[] }
  | { status: "error"; message: string };

export async function redeemReward(cafe: Cafe, customerId: string, rewardId: string, now = new Date()): Promise<RedeemResult> {
  const repo = getRepo();
  const today = localDate(now, cafe.timezone);
  const reward = await repo.redeemReward(cafe.id, customerId, rewardId, now, today);
  if (!reward) return { status: "error", message: "That reward was already used." };
  const [savings, remaining, customer] = await Promise.all([
    repo.savings(cafe.id, customerId, today),
    repo.listAvailableRewards(cafe.id, customerId),
    repo.getCustomer(cafe.id, customerId),
  ]);
  if (customer) refreshWalletPassesLater(cafe, customer);
  return {
    status: "ok",
    redeemedName: reward.name,
    valueLabel: formatMoney(reward.valueCents, cafe.currency),
    savedTodayCents: savings.todayCents,
    savedToday: savedTodayLine(savings.todayCents, cafe.currency),
    totalSaved: totalSavedLine(savings.totalCents, cafe.currency),
    remainingIds: remaining.map((r) => r.id),
  };
}
