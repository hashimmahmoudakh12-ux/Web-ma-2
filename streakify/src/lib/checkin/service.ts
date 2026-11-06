/**
 * CHECK-IN SERVICE: glues everything together for one check-in.
 *
 *   phone typed -> find customer -> streak engine -> save -> build the
 *   friendly result screen (level, progress, rewards, savings messages).
 *
 * The counter screen's server actions call these functions.
 */
import "server-only";
import { getRepo, ConflictError, DuplicatePhoneError, type Cafe, type Customer, type Reward } from "../data";
import { formatMoney } from "../money";
import { PRIVACY_VERSION, smsConsentText } from "../privacy";
import { type Clock, type StreakEvent, checkIn, levelIndexFor, progressFor } from "../streak/engine";
import { eventLines, nextTimeLine, progressLine, riskLine, savedTodayLine, totalSavedLine } from "../streak/messages";
import { formatTime, localDate } from "../time";
import { verifyVisitInBackground } from "../pos";

export type RewardView = { id: string; name: string; valueLabel: string; kind: Reward["kind"]; isNew: boolean };

export type CheckInView = {
  customerId: string;
  publicToken: string;
  personalUrl?: string;
  qrSvg?: string;
  firstName: string;
  isNewMember: boolean;
  levelName: string;
  levelPerk: string | null;
  leveledUpTo: string | null;
  streakWeeks: number;
  streakVisits: number;
  progress: { fraction: number; line: string; targetName: string | null };
  rewards: RewardView[];
  savedTodayCents: number;
  lines: {
    savedToday: string | null;
    nextTime: string;
    totalSaved: string;
    events: string[];
    risk: string | null;
  };
};

export type CheckInResult =
  | { status: "ok"; view: CheckInView }
  | { status: "cooldown"; message: string }
  | { status: "new"; phone: string }
  | { status: "error"; message: string };

function clockFor(cafe: Cafe, now: Date): Clock {
  return { now, timeZone: cafe.timezone };
}

function rewardView(r: Reward, cafe: Cafe, newIds: Set<string>): RewardView {
  return { id: r.id, name: r.name, valueLabel: formatMoney(r.valueCents, cafe.currency), kind: r.kind, isNew: newIds.has(r.id) };
}

async function buildView(
  cafe: Cafe,
  customer: Customer,
  now: Date,
  ctx: { events: StreakEvent[]; earnedBefore: Set<string>; isNewMember: boolean; leveledUpTo: string | null },
): Promise<CheckInView> {
  const repo = getRepo();
  const clock = clockFor(cafe, now);
  const today = localDate(now, cafe.timezone);
  const [available, savings] = await Promise.all([
    repo.listAvailableRewards(cafe.id, customer.id),
    repo.savings(cafe.id, customer.id, today),
  ]);
  const newIds = new Set(available.filter((r) => !ctx.earnedBefore.has(r.id)).map((r) => r.id));
  const p = progressFor(customer.streakVisits, cafe.program);
  return {
    customerId: customer.id,
    publicToken: customer.publicToken,
    firstName: customer.firstName,
    isNewMember: ctx.isNewMember,
    levelName: p.level.name,
    levelPerk: p.level.perk ?? null,
    leveledUpTo: ctx.leveledUpTo,
    streakWeeks: customer.streakWeeks,
    streakVisits: customer.streakVisits,
    progress: { fraction: p.fraction, line: progressLine(customer, cafe.program), targetName: p.target?.name ?? null },
    rewards: available.map((r) => rewardView(r, cafe, newIds)),
    savedTodayCents: savings.todayCents,
    lines: {
      savedToday: savedTodayLine(savings.todayCents, cafe.currency),
      nextTime: nextTimeLine(customer, cafe.program, clock, cafe.currency),
      totalSaved: totalSavedLine(savings.totalCents, cafe.currency),
      events: eventLines(ctx.events, cafe.program),
      risk: riskLine(customer, cafe.program, clock, cafe.currency),
    },
  };
}

/** Check in an existing customer. Retries if two taps race each other. */
export async function checkInCustomer(cafe: Cafe, customerId: string, now = new Date(), isNewMember = false): Promise<CheckInResult> {
  const repo = getRepo();
  for (let attempt = 0; attempt < 3; attempt++) {
    const customer = await repo.getCustomer(cafe.id, customerId);
    if (!customer) return { status: "error", message: "Customer not found." };

    const outcome = checkIn(customer, cafe.program, clockFor(cafe, now));
    if (!outcome.ok) {
      const at = formatTime(outcome.lastVisitAt, cafe.timezone);
      const next = formatTime(outcome.nextAllowedAt, cafe.timezone);
      return {
        status: "cooldown",
        message: `${customer.firstName}, you already checked in at ${at}. You can check in again after ${next}.`,
      };
    }

    const earnedBefore = new Set((await repo.listAvailableRewards(cafe.id, customer.id)).map((r) => r.id));
    const levelAfter = cafe.program.levels[levelIndexFor(outcome.state.streakVisits, cafe.program.levels)];
    let visitId: string;
    try {
      ({ visitId } = await repo.applyCheckIn({
        cafeId: cafe.id,
        customerId: customer.id,
        expectedVersion: customer.version,
        state: outcome.state,
        visit: {
          createdAt: now.toISOString(),
          localDate: outcome.visit.localDate,
          weekStart: outcome.visit.weekStart,
          source: "counter",
          streakVisitsAfter: outcome.state.streakVisits,
          levelAfter: levelAfter.key,
        },
        rewards: outcome.rewards,
        events: outcome.events,
      }));
    } catch (e) {
      if (e instanceof ConflictError) continue; // someone else just saved; reload and retry
      throw e;
    }

    verifyVisitInBackground(cafe, visitId, now, customer.phone);

    const leveledUp = [...outcome.events].reverse().find((e) => e.type === "level_up");
    const updated = { ...customer, ...outcome.state, version: customer.version + 1 };
    const view = await buildView(cafe, updated, now, {
      events: outcome.events,
      earnedBefore,
      isNewMember,
      leveledUpTo: leveledUp && leveledUp.type === "level_up" ? levelAfter.name : null,
    });
    return { status: "ok", view };
  }
  return { status: "error", message: "Busy, please try again." };
}

export async function checkInByPhone(cafe: Cafe, phone: string, now = new Date()): Promise<CheckInResult> {
  const customer = await getRepo().findCustomerByPhone(cafe.id, phone);
  if (!customer) return { status: "new", phone };
  return checkInCustomer(cafe, customer.id, now);
}

export type SignUpInput = {
  phone: string;
  firstName: string;
  birthdayMonth: number | null;
  birthdayDay: number | null;
  smsOptIn: boolean;
  leaderboardOptIn: boolean;
};

export async function signUpAndCheckIn(cafe: Cafe, input: SignUpInput, now = new Date()): Promise<CheckInResult> {
  const repo = getRepo();
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
      now,
    });
    customerId = c.id;
  } catch (e) {
    if (!(e instanceof DuplicatePhoneError)) throw e;
    // Double-tapped "Join": the account exists already, just check in.
    const existing = await repo.findCustomerByPhone(cafe.id, input.phone);
    if (!existing) throw e;
    return checkInCustomer(cafe, existing.id, now);
  }
  return checkInCustomer(cafe, customerId, now, true);
}

export type RedeemResult =
  | { status: "ok"; redeemedName: string; valueLabel: string; savedTodayCents: number; savedToday: string | null; totalSaved: string; remainingIds: string[] }
  | { status: "error"; message: string };

export async function redeemReward(cafe: Cafe, customerId: string, rewardId: string, now = new Date()): Promise<RedeemResult> {
  const repo = getRepo();
  const today = localDate(now, cafe.timezone);
  const reward = await repo.redeemReward(cafe.id, customerId, rewardId, now, today);
  if (!reward) return { status: "error", message: "That reward was already used." };
  const [savings, remaining] = await Promise.all([
    repo.savings(cafe.id, customerId, today),
    repo.listAvailableRewards(cafe.id, customerId),
  ]);
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
