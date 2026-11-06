/**
 * DEMO MODE: builds a realistic café history with fake customers.
 *
 * It doesn't invent numbers: it replays fake visits (and drink orders, and
 * mystery dallah openings) through the real game engine, so every level,
 * badge, stamp and reward is exactly what the real rules would produce.
 * History is replayed WITHOUT limited-time events so the showcase stories
 * below land exactly; live check-ins during a pitch use the real rules.
 * Everything is relative to "now". A fixed random seed = same demo every reset.
 *
 * All phone numbers use 555-01XX, which are reserved as fictional in the US.
 */
import type { Program } from "../program";
import { type StreakState, checkIn, levelIndexFor, newStreakState, openMystery, stampItems } from "../streak/engine";
import { addDays, localDate, monthKey, weekStart, zonedInstant } from "../time";
import type { DemoDataset } from "../data/types";

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

type Showcase = ShowcaseCustomer & {
  birthdayToday?: boolean;
  schedule: [number, number][]; // [weeksAgo, dayOffset 0-6]
  redeem: boolean;
  items?: string[][]; // items ordered on each visit (passport stamps)
  keepMysteryClosed?: boolean;
};

/** Customers to type in during a pitch, each showing off one feature. */
export const SHOWCASE: Showcase[] = [
  { phone: "+13135550101", display: "(313) 555-0101", firstName: "Layla", story: "Levels up on this visit (confetti on her phone)", schedule: [[3, 1], [2, 2], [1, 1]], redeem: true },
  { phone: "+13135550102", display: "(313) 555-0102", firstName: "Omar", story: "3 rewards waiting, in a squad with Layla", schedule: [[7, 0], [6, 1], [5, 2], [4, 0], [3, 3], [2, 1], [1, 2]], redeem: false },
  { phone: "+13135550103", display: "(313) 555-0103", firstName: "Maria", story: "2nd visit: $1.50 welcome reward", schedule: [[1, 3]], redeem: true },
  { phone: "+13135550104", display: "(313) 555-0104", firstName: "Noor", story: "Birthday today: free birthday drink", birthdayToday: true, schedule: [[4, 1], [3, 1], [2, 1], [1, 1]], redeem: true },
  { phone: "+13135550105", display: "(313) 555-0105", firstName: "Sam", story: "Missed a week, streak saver kicks in", schedule: [[6, 2], [5, 2], [4, 2], [3, 2], [2, 2]], redeem: true },
  {
    phone: "+13135550106", display: "(313) 555-0106", firstName: "Jake", story: "Top level, secret menu unlocked",
    schedule: Array.from({ length: 10 }, (_, i) => [[10 - i, 0], [10 - i, 3]] as [number, number][]).flat(), redeem: true,
  },
  {
    phone: "+13135550107", display: "(313) 555-0107", firstName: "Zara", story: "Unopened mystery dallah + 1 stamp from a full passport page",
    schedule: [[5, 1], [4, 1], [3, 1], [2, 1], [1, 1]], redeem: true,
    items: [["honey-latte"], ["espresso"], ["maple-cold-brew"], ["latte"], []], keepMysteryClosed: true,
  },
];

const NAMES = [
  "Ahmed", "Fatima", "Yusuf", "Mariam", "Ali", "Hana", "Khalid", "Aisha", "Tariq", "Sara",
  "Ben", "Chloe", "Diego", "Emma", "Grace", "Hassan", "Ivy", "Jamal", "Kim", "Leo",
  "Mona", "Nick", "Priya", "Rami", "Sofia", "Tom", "Uma", "Victor", "Wes", "Yara",
  "Zain", "Amal", "Bilal", "Dana", "Eli",
];

export function generateDemoData(liveProgram: Program, timeZone: string, now = new Date()): DemoDataset {
  const program: Program = { ...liveProgram, events: [] }; // see note at the top
  const rand = mulberry32(20261106);
  const today = localDate(now, timeZone);
  const thisWeek = weekStart(today, program.weekStartsOn);
  const data: DemoDataset = { customers: [], visits: [], rewards: [], squads: [] };
  const mysterySpent = new Map<string, number>(); // month -> cents
  const itemIds = program.menu.items.map((i) => i.id);

  function addCustomer(opts: {
    phone: string;
    firstName: string;
    birthday: { month: number; day: number } | null;
    visits: { day: string; hour: number; items: string[] }[];
    redeemChance: number;
    keepMysteryClosed?: boolean;
  }) {
    const visits = opts.visits.filter((v) => v.day < today); // keep "today" free for live check-ins
    if (!visits.length) return -1;
    const customerIndex = data.customers.length;
    let state: StreakState = newStreakState(opts.birthday);
    const open: number[] = [];
    let createdAt = "";

    const record = (rewards: { kind: string; levelKey?: string; name: string; valueCents: number; costCents: number }[], at: Date, day: string) => {
      for (const r of rewards) {
        open.push(data.rewards.length);
        data.rewards.push({ customerIndex, kind: r.kind, levelKey: r.levelKey, name: r.name, valueCents: r.valueCents, costCents: r.costCents, earnedAt: at.toISOString(), earnedLocalDate: day, redeemedAt: null, redeemedLocalDate: null });
      }
    };

    for (const v of visits) {
      const at = zonedInstant(v.day, v.hour, Math.floor(rand() * 60), timeZone);
      if (!createdAt) createdAt = at.toISOString();
      for (const idx of [...open]) {
        if (rand() < opts.redeemChance) {
          data.rewards[idx].redeemedAt = at.toISOString();
          data.rewards[idx].redeemedLocalDate = v.day;
          open.splice(open.indexOf(idx), 1);
        }
      }
      const out = checkIn(state, program, { now: at, timeZone }, rand);
      if (!out.ok) continue;
      state = out.state;
      record(out.rewards, at, v.day);
      let xp = out.xpGained;

      const later = new Date(at.getTime() + 2 * 60_000);
      if (v.items.length) {
        const stamped = stampItems(state, program, v.items, { now: later, timeZone });
        state = stamped.state;
        record(stamped.rewards, later, v.day);
        xp += stamped.xpLines.reduce((a, l) => a + l.xp, 0);
      }
      // Open new mystery dallahs (like customers do on their phones)
      for (const box of state.game.mystery.filter((b) => !b.openedAt)) {
        if (opts.keepMysteryClosed) break;
        const m = monthKey(v.day);
        const left = program.mystery.monthlyBudgetCents - (mysterySpent.get(m) ?? 0);
        const opened = openMystery(state, program, box.id, left, { now: later, timeZone }, rand);
        if (!opened) continue;
        state = opened.state;
        mysterySpent.set(m, (mysterySpent.get(m) ?? 0) + opened.prize.costCents);
        record(opened.rewards, later, v.day);
        xp += opened.xpLines.reduce((a, l) => a + l.xp, 0);
      }
      data.visits.push({
        customerIndex,
        createdAt: at.toISOString(),
        localDate: out.visit.localDate,
        weekStart: out.visit.weekStart,
        streakVisitsAfter: state.streakVisits,
        levelAfter: program.levels[levelIndexFor(state.xp, program.levels)].key,
        xp,
      });
    }
    // Old celebrations count as already seen (only new ones animate on the phone).
    state.game.seenAt = state.game.inbox.at(-1)?.at ?? null;

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
    return customerIndex;
  }

  // 1) Showcase customers (fixed stories for pitching).
  const showIdx: Record<string, number> = {};
  for (const c of SHOWCASE) {
    const [, m, d] = today.split("-").map(Number);
    showIdx[c.firstName] = addCustomer({
      phone: c.phone,
      firstName: c.firstName,
      birthday: c.birthdayToday ? { month: m, day: d } : null,
      visits: c.schedule.map(([weeksAgo, dow], i) => ({ day: addDays(thisWeek, -7 * weeksAgo + dow), hour: 10, items: c.items?.[i] ?? [] })),
      redeemChance: c.redeem ? 1 : 0,
      keepMysteryClosed: c.keepMysteryClosed,
    });
  }

  // 2) A crowd of random regulars, from die-hards to drop-offs.
  const crowd: number[] = [];
  NAMES.forEach((firstName, i) => {
    const loyalty = [0.95, 0.85, 0.6, 0.35][i % 4];
    const startWeeksAgo = 2 + Math.floor(rand() * 11);
    const visits: { day: string; hour: number; items: string[] }[] = [];
    for (let w = startWeeksAgo; w >= 0; w--) {
      if (rand() > loyalty) continue;
      const perWeek = 1 + Math.floor(rand() * (loyalty > 0.8 ? 3 : 2));
      const dows = new Set<number>();
      while (dows.size < perWeek) dows.add(Math.floor(rand() * 7));
      for (const dow of [...dows].sort()) {
        const items = rand() < 0.6 && itemIds.length ? [itemIds[Math.floor(rand() * itemIds.length)]] : [];
        visits.push({ day: addDays(thisWeek, -7 * w + dow), hour: 7 + Math.floor(rand() * 15), items });
      }
    }
    const hasBirthday = rand() < 0.5;
    crowd.push(
      addCustomer({
        phone: `+1313555${String(110 + i).padStart(4, "0")}`,
        firstName,
        birthday: hasBirthday ? { month: 1 + Math.floor(rand() * 12), day: 1 + Math.floor(rand() * 28) } : null,
        visits,
        redeemChance: 0.85,
      }),
    );
  });

  // 3) Squads
  const lastWeek = addDays(thisWeek, -7);
  data.squads = [
    { name: "Morning Crew", code: "CREW1", members: [showIdx.Omar, showIdx.Layla, crowd[0]].filter((i) => i >= 0), streakWeeks: 3, lastCompleteWeek: lastWeek },
    { name: "Study Buddies", code: "STUDY", members: [crowd[4], crowd[8], crowd[12]].filter((i) => i >= 0), streakWeeks: 1, lastCompleteWeek: lastWeek },
  ];
  return data;
}
