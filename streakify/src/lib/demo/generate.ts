/**
 * DEMO MODE: builds a realistic café history with fake customers.
 *
 * It doesn't just invent numbers — it replays fake visits through the real
 * streak engine, so every customer's level, savers and rewards are exactly
 * what the real rules would produce. Everything is relative to "now", so the
 * demo always looks fresh. A fixed random seed makes it the same every reset.
 *
 * All phone numbers use 555-01XX, which are reserved as fictional in the US.
 */
import type { Program } from "../program";
import { type StreakState, checkIn, levelIndexFor, newStreakState } from "../streak/engine";
import { addDays, localDate, weekStart, zonedInstant } from "../time";
import type { DemoDataset } from "../data/types";

/** Small deterministic random number generator (same seed -> same demo). */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type ShowcaseCustomer = { phone: string; display: string; firstName: string; story: string };

/** Customers to type in during a pitch, each showing off one feature. */
export const SHOWCASE: (ShowcaseCustomer & {
  birthdayToday?: boolean;
  /** Visit schedule: list of [weeksAgo, dayOfWeekOffset(0-6)] */
  schedule: [number, number][];
  redeem: boolean;
})[] = [
  {
    phone: "+13135550101", display: "(313) 555-0101", firstName: "Layla",
    story: "1 visit away from a free pastry",
    schedule: [[3, 1], [2, 2], [1, 1]], redeem: true,
  },
  {
    phone: "+13135550102", display: "(313) 555-0102", firstName: "Omar",
    story: "1 visit from Gold, has rewards waiting to use",
    schedule: [[7, 0], [6, 1], [5, 2], [4, 0], [3, 3], [2, 1], [1, 2]], redeem: false,
  },
  {
    phone: "+13135550103", display: "(313) 555-0103", firstName: "Maria",
    story: "Joined last week, gets $1.50 off now",
    schedule: [[1, 3]], redeem: true,
  },
  {
    phone: "+13135550104", display: "(313) 555-0104", firstName: "Noor",
    story: "Birthday today, free birthday drink",
    birthdayToday: true, schedule: [[4, 1], [3, 1], [2, 1], [1, 1]], redeem: true,
  },
  {
    phone: "+13135550105", display: "(313) 555-0105", firstName: "Sam",
    story: "Missed a week, streak saver kicks in",
    schedule: [[6, 2], [5, 2], [4, 2], [3, 2], [2, 2]], redeem: true,
  },
  {
    phone: "+13135550106", display: "(313) 555-0106", firstName: "Jake",
    story: "Top level, secret menu unlocked",
    schedule: Array.from({ length: 10 }, (_, i) => [[10 - i, 0], [10 - i, 3]] as [number, number][]).flat(),
    redeem: true,
  },
];

const NAMES = [
  "Ahmed", "Fatima", "Yusuf", "Mariam", "Ali", "Hana", "Khalid", "Aisha", "Tariq", "Sara",
  "Ben", "Chloe", "Diego", "Emma", "Grace", "Hassan", "Ivy", "Jamal", "Kim", "Leo",
  "Mona", "Nick", "Priya", "Rami", "Sofia", "Tom", "Uma", "Victor", "Wes", "Yara",
  "Zain", "Amal", "Bilal", "Dana", "Eli",
];

export function generateDemoData(program: Program, timeZone: string, now = new Date()): DemoDataset {
  const rand = mulberry32(20261106);
  const today = localDate(now, timeZone);
  const thisWeek = weekStart(today, program.weekStartsOn);
  const data: DemoDataset = { customers: [], visits: [], rewards: [] };

  function addCustomer(opts: {
    phone: string;
    firstName: string;
    birthday: { month: number; day: number } | null;
    visitDays: string[]; // local dates, ascending
    redeemChance: number;
  }) {
    const visitDays = opts.visitDays.filter((d) => d < today); // keep "today" free for live check-ins
    if (!visitDays.length) return;
    const customerIndex = data.customers.length;
    let state: StreakState = newStreakState(opts.birthday);
    const open: number[] = []; // indexes into data.rewards still available
    let createdAt = "";

    for (const day of visitDays) {
      const at = zonedInstant(day, 8 + Math.floor(rand() * 10), Math.floor(rand() * 60), timeZone);
      if (!createdAt) createdAt = at.toISOString();
      // Redeem earlier rewards at this visit (cashier presses "Streak Reward").
      for (const idx of [...open]) {
        if (rand() < opts.redeemChance) {
          data.rewards[idx].redeemedAt = at.toISOString();
          data.rewards[idx].redeemedLocalDate = day;
          open.splice(open.indexOf(idx), 1);
        }
      }
      const out = checkIn(state, program, { now: at, timeZone }, rand);
      if (!out.ok) continue;
      state = out.state;
      data.visits.push({
        customerIndex,
        createdAt: at.toISOString(),
        localDate: out.visit.localDate,
        weekStart: out.visit.weekStart,
        streakVisitsAfter: state.streakVisits,
        levelAfter: program.levels[levelIndexFor(state.streakVisits, program.levels)].key,
      });
      for (const r of out.rewards) {
        open.push(data.rewards.length);
        data.rewards.push({
          customerIndex,
          kind: r.kind,
          levelKey: r.levelKey,
          name: r.name,
          valueCents: r.valueCents,
          costCents: r.costCents,
          earnedAt: at.toISOString(),
          earnedLocalDate: day,
          redeemedAt: null,
          redeemedLocalDate: null,
        });
      }
    }

    data.customers.push({
      cafeId: "",
      phone: opts.phone,
      firstName: opts.firstName,
      birthdayMonth: opts.birthday?.month ?? null,
      birthdayDay: opts.birthday?.day ?? null,
      privacyVersion: "demo",
      smsOptIn: rand() < 0.6,
      smsConsentText: null,
      leaderboardOptIn: rand() < 0.75,
      now: new Date(createdAt),
      createdAt,
      state,
    });
  }

  // 1) Showcase customers (fixed stories for pitching).
  for (const c of SHOWCASE) {
    const [, m, d] = today.split("-").map(Number);
    addCustomer({
      phone: c.phone,
      firstName: c.firstName,
      birthday: c.birthdayToday ? { month: m, day: d } : null,
      visitDays: c.schedule.map(([weeksAgo, dow]) => addDays(thisWeek, -7 * weeksAgo + dow)),
      redeemChance: c.redeem ? 1 : 0,
    });
  }

  // 2) A crowd of random regulars, from die-hards to drop-offs.
  NAMES.forEach((firstName, i) => {
    const loyalty = [0.95, 0.85, 0.6, 0.35][i % 4];
    const startWeeksAgo = 2 + Math.floor(rand() * 11);
    const days: string[] = [];
    for (let w = startWeeksAgo; w >= 0; w--) {
      if (rand() > loyalty) continue;
      const perWeek = 1 + Math.floor(rand() * (loyalty > 0.8 ? 3 : 2));
      const dows = new Set<number>();
      while (dows.size < perWeek) dows.add(Math.floor(rand() * 7));
      [...dows].sort().forEach((dow) => days.push(addDays(thisWeek, -7 * w + dow)));
    }
    const hasBirthday = rand() < 0.5;
    addCustomer({
      phone: `+1313555${String(110 + i).padStart(4, "0")}`,
      firstName,
      birthday: hasBirthday ? { month: 1 + Math.floor(rand() * 12), day: 1 + Math.floor(rand() * 28) } : null,
      visitDays: days,
      redeemChance: 0.85,
    });
  });

  return data;
}
