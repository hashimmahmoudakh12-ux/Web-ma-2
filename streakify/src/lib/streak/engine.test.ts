/**
 * Tests for the game rules. Run with:  npm test
 * Each test is a little story: "a customer visits on these days, expect this".
 * Dates use New York time; Nov 2, 2026 is a Monday.
 */
import { describe, expect, it } from "vitest";
import { sanaaCafe } from "../demo/cafes";
import { parseProgram, type Program } from "../program";
import {
  type StreakState,
  awardBonus,
  challengeStatuses,
  checkIn,
  newStreakState,
  openMystery,
  progressFor,
  stampItems,
  streakRisk,
} from "./engine";
import { nextBadge, nextTimeLine, progressLine, riskLine } from "./messages";

const tz = "America/New_York";
const noLuck = () => 0.99;
const at = (local: string) => ({ now: new Date(`${local}-05:00`), timeZone: tz });

/** A simple café so the math is easy: 100 XP per visit, no streak bonus. */
const simple: Program = parseProgram({
  levels: [
    { key: "bronze", name: "Bronze", minXp: 0 },
    { key: "silver", name: "Silver", minXp: 300, reward: { name: "Free pastry", valueCents: 450, costCents: 120 } },
    { key: "gold", name: "Gold", minXp: 600, reward: { name: "Free drink", valueCents: 600, costCents: 150 } },
    { key: "legend", name: "Legend", minXp: 1000, perk: "secret menu unlocked" },
  ],
  xp: { perVisit: 100, perStreakWeek: 0, streakBonusCap: 0, newItem: 50 },
  welcomeReward: { enabled: true, onVisit: 2, name: "$1.50 off", valueCents: 150, costCents: 150 },
  birthdayReward: { enabled: true, windowDays: 7, name: "Free birthday drink", valueCents: 600, costCents: 150 },
  menu: {
    categories: [{ id: "yemeni", name: "Yemeni", reward: { name: "Free Yemeni drink", valueCents: 600, costCents: 150 } }, { id: "cold", name: "Cold" }],
    items: [
      { id: "qishr", name: "Qishr", categoryId: "yemeni" },
      { id: "adeni", name: "Adeni Chai", categoryId: "yemeni" },
      { id: "mango", name: "Mango Refresher", categoryId: "cold" },
    ],
  },
});

function visit(state: StreakState, local: string, program = simple, rng = noLuck) {
  const out = checkIn(state, program, at(local), rng);
  if (!out.ok) throw new Error(`check-in at ${local} was refused`);
  return out;
}

/** One visit a week on Mondays, starting Nov 2. */
function weekly(n: number, program = simple, start = "2026-11-02") {
  let s = newStreakState();
  const startMs = new Date(`${start}T12:00:00Z`).getTime();
  for (let i = 0; i < n; i++) {
    const day = new Date(startMs + i * 7 * 86_400_000).toISOString().slice(0, 10);
    s = visit(s, `${day}T10:00:00`, program).state;
  }
  return s;
}

describe("check-in & XP", () => {
  it("first visit earns XP and starts the streak", () => {
    const out = visit(newStreakState(), "2026-11-02T10:00:00");
    expect(out.state.xp).toBe(100);
    expect(out.xpLines).toEqual([{ label: "Check-in", xp: 100 }]);
    expect(out.state.streakWeeks).toBe(1);
    expect(out.rewards).toEqual([]);
  });

  it("second visit gives the welcome reward", () => {
    const s1 = visit(newStreakState(), "2026-11-02T10:00:00").state;
    expect(visit(s1, "2026-11-04T10:00:00").rewards.map((r) => r.kind)).toEqual(["welcome"]);
  });

  it("blocks a second check-in within 3 hours (anti-cheat)", () => {
    const s1 = visit(newStreakState(), "2026-11-02T10:00:00").state;
    expect(checkIn(s1, simple, at("2026-11-02T12:59:00")).ok).toBe(false);
    expect(checkIn(s1, simple, at("2026-11-02T13:00:00")).ok).toBe(true);
  });

  it("level-up gives the level reward and a celebration", () => {
    const s2 = weekly(2);
    const out = visit(s2, "2026-11-16T10:00:00");
    expect(out.state.xp).toBe(300);
    expect(out.events).toContainEqual({ type: "level_up", toLevel: "silver" });
    expect(out.rewards).toContainEqual(expect.objectContaining({ kind: "level", name: "Free pastry" }));
    expect(out.celebrations.some((c) => c.type === "level_up")).toBe(true);
  });

  it("streak bonus and event multiplier", () => {
    const p = parseProgram({
      ...simple,
      xp: { perVisit: 100, perStreakWeek: 10, streakBonusCap: 50, newItem: 50 },
      events: [{ id: "ramadan", name: "Ramadan Nights", icon: "🌙", start: "2026-11-01", end: "2026-11-30", xpMultiplier: 2, fromHour: 18, toHour: 24 }],
    });
    const day = visit(newStreakState(), "2026-11-02T10:00:00", p); // outside window
    expect(day.xpGained).toBe(110);
    const night = visit(newStreakState(), "2026-11-02T19:30:00", p); // after iftar: double
    expect(night.xpGained).toBe(220);
    expect(night.state.game.eventVisits.ramadan).toBe(1);
  });
});

describe("missing weeks", () => {
  it("uses the monthly streak saver first", () => {
    const s = weekly(3); // Nov 2, 9, 16
    const out = visit(s, "2026-11-30T10:00:00"); // skipped week of Nov 23
    expect(out.events[0]).toEqual({ type: "saver_used", week: "2026-11-23" });
    expect(out.state.streakWeeks).toBe(4);
  });

  it("a second missed week drops ONE level; XP falls to that level's start", () => {
    const s = weekly(7); // 700 XP = Gold, last visit Dec 14
    // Savers count by the month a week ENDS in:
    // Dec 21 week -> December saver, Dec 28 week (ends Jan 3) -> January saver,
    // Jan 4 week -> no saver left -> drop Gold to Silver
    const out = visit(s, "2027-01-11T10:00:00");
    expect(out.events.slice(0, 3)).toEqual([
      { type: "saver_used", week: "2026-12-21" },
      { type: "saver_used", week: "2026-12-28" },
      { type: "level_drop", week: "2027-01-04", fromLevel: "gold", toLevel: "silver" },
    ]);
    expect(out.before.xp).toBe(300);
    expect(out.state.streakWeeks).toBe(1);
    expect(out.state.totalVisits).toBe(8); // lifetime never drops
  });

  it("badges are kept after a drop", () => {
    const p = parseProgram({ ...simple, badges: [{ key: "v3", name: "Three", rule: { type: "total_visits", count: 3 }, xp: 0 }] });
    const s = weekly(3, p);
    expect(s.game.badges.v3).toBeTruthy();
    const out = visit(s, "2027-03-01T10:00:00", p);
    expect(out.before.xp).toBe(0);
    expect(out.state.game.badges.v3).toBeTruthy();
  });
});

describe("milestones, badges, challenges", () => {
  it("4-week milestone gives XP + reward once, plus streak badge", () => {
    const p = parseProgram({
      ...simple,
      milestones: [{ weeks: 4, xp: 100, reward: { name: "Free cookie", valueCents: 300, costCents: 60 } }],
      badges: [{ key: "fire", name: "On Fire", icon: "🔥", xp: 0, rule: { type: "streak_weeks", weeks: 4 } }],
    });
    const s3 = weekly(3, p);
    const out = visit(s3, "2026-11-23T10:00:00", p);
    expect(out.events).toContainEqual({ type: "milestone", weeks: 4 });
    expect(out.rewards).toContainEqual(expect.objectContaining({ kind: "milestone", name: "Free cookie" }));
    expect(out.state.game.badges.fire).toBeTruthy();
    expect(out.state.xp).toBe(500);
  });

  it("Early Bird and Night Owl", () => {
    const p = parseProgram({
      ...simple,
      badges: [
        { key: "early", name: "Early Bird", rule: { type: "visit_before_hour", hour: 9 }, xp: 25 },
        { key: "owl", name: "Night Owl", rule: { type: "visit_after_hour", hour: 20 }, xp: 25 },
      ],
    });
    expect(Object.keys(visit(newStreakState(), "2026-11-02T08:15:00", p).state.game.badges)).toEqual(["early"]);
    expect(Object.keys(visit(newStreakState(), "2026-11-02T21:00:00", p).state.game.badges)).toEqual(["owl"]);
  });

  it("weekly 'visit 3 times' challenge completes once per week", () => {
    const p = parseProgram({ ...simple, cooldownMinutes: 0, challenges: [{ id: "v3", title: "Visit 3 times", goal: { type: "visits", count: 3 }, xp: 150 }] });
    let s = newStreakState();
    s = visit(s, "2026-11-02T10:00:00", p).state;
    s = visit(s, "2026-11-03T10:00:00", p).state;
    expect(challengeStatuses(s, p, at("2026-11-03T11:00:00"))[0]).toMatchObject({ current: 2, target: 3, done: false });
    const third = visit(s, "2026-11-04T10:00:00", p);
    expect(third.xpLines).toContainEqual({ label: "Challenge: Visit 3 times", xp: 150 });
    const fourth = visit(third.state, "2026-11-05T10:00:00", p);
    expect(fourth.xpLines.some((l) => l.label.startsWith("Challenge"))).toBe(false);
  });

  it("perfect month", () => {
    const p = parseProgram({ ...simple, badges: [{ key: "pm", name: "Perfect Month", rule: { type: "perfect_month" }, xp: 0 }] });
    // November 2026 week starts: Nov 2, 9, 16, 23, 30
    const s = weekly(4, p);
    expect(s.game.badges.pm).toBeUndefined();
    expect(visit(s, "2026-11-30T10:00:00", p).state.game.badges.pm).toBeTruthy();
  });
});

describe("drink passport", () => {
  it("new drinks give stamps + XP; finishing a category gives its reward", () => {
    const s = visit(newStreakState(), "2026-11-02T10:00:00").state;
    const a = stampItems(s, simple, ["qishr"], at("2026-11-02T10:01:00"));
    expect(a.xpLines).toEqual([{ label: "New stamp: Qishr", xp: 50 }]);
    const again = stampItems(a.state, simple, ["qishr"], at("2026-11-02T10:02:00"));
    expect(again.xpLines).toEqual([]); // already stamped
    const b = stampItems(a.state, simple, ["adeni"], at("2026-11-02T10:02:00"));
    expect(b.rewards).toContainEqual(expect.objectContaining({ kind: "passport", name: "Free Yemeni drink" }));
    expect(b.state.game.categoriesDone).toEqual(["yemeni"]);
  });
});

describe("mystery dallah", () => {
  const p = parseProgram({
    ...simple,
    mystery: {
      enabled: true,
      everyNthVisit: 2,
      chance: 0,
      monthlyBudgetCents: 500,
      prizes: [
        { id: "xp", name: "+150 XP", weight: 1, xp: 150 },
        { id: "beans", name: "Coffee beans", weight: 1000, valueCents: 1800, costCents: 700 },
      ],
    },
  });

  it("earned every 2nd visit, opened on the phone", () => {
    const s1 = visit(newStreakState(), "2026-11-02T10:00:00", p).state;
    expect(s1.game.mystery).toHaveLength(0);
    const s2 = visit(s1, "2026-11-09T10:00:00", p).state;
    expect(s2.game.mystery).toHaveLength(1);
    const box = s2.game.mystery[0];
    // Beans cost $7 but only $5 budget left -> only the XP prize is possible
    const opened = openMystery(s2, p, box.id, 500, at("2026-11-09T10:05:00"), () => 0.5)!;
    expect(opened.prize.id).toBe("xp");
    expect(opened.state.xp).toBe(350);
    expect(openMystery(opened.state, p, box.id, 500, at("2026-11-09T10:06:00"))).toBeNull(); // can't open twice
    // With budget, the heavy-weight beans win
    expect(openMystery(s2, p, box.id, 10_000, at("2026-11-09T10:05:00"), () => 0.5)!.prize.id).toBe("beans");
  });
});

describe("referrals", () => {
  it("referred friend gets bonus XP on first visit; referrer capped per month", () => {
    const friend = newStreakState();
    friend.game.referredBy = "abc";
    const out = visit(friend, "2026-11-02T10:00:00");
    expect(out.xpLines).toContainEqual({ label: "Friend referral bonus", xp: 200 });
    let referrer = weekly(1);
    const clock = at("2026-11-03T10:00:00");
    for (let i = 0; i < 5; i++) referrer = awardBonus(referrer, simple, { xp: 200, label: "Friend joined", referral: true }, clock).state;
    const sixth = awardBonus(referrer, simple, { xp: 200, label: "Friend joined", referral: true }, clock);
    expect(sixth.xpLines).toEqual([]);
    expect(sixth.state.game.referrals).toBe(6);
  });
});

describe("messages", () => {
  it("progress line in XP with a visit estimate", () => {
    expect(progressLine(weekly(1), simple)).toBe("200 XP to Silver (about 2 visits) and your free pastry.");
    expect(progressLine(weekly(10), simple)).toBe("You're a Legend: secret menu unlocked.");
  });

  it("come back by next week's last day", () => {
    const s = weekly(1);
    expect(nextTimeLine(s, simple, at("2026-11-02T10:05:00"), "USD")).toBe("Come back by Sunday, Nov 15 to save $1.50 next time.");
  });

  it("warns when the streak ends tomorrow", () => {
    const s = weekly(3); // last visit Nov 16, none in week of Nov 23
    const noSaver = { ...s, saverMonth: "2026-11", saversUsedInMonth: 1 };
    expect(streakRisk(noSaver, simple, at("2026-11-27T12:00:00"))).toBeNull();
    const sat = at("2026-11-28T12:00:00");
    expect(riskLine(noSaver, simple, sat, "USD")).toBe("Your streak ends tomorrow, that's $6 you'll lose.");
    expect(riskLine(s, simple, sat, "USD")).toContain("streak saver will cover you");
  });

  it("next badge is the closest locked one", () => {
    const p = parseProgram({
      ...simple,
      badges: [
        { key: "v10", name: "Ten", rule: { type: "total_visits", count: 10 }, xp: 0 },
        { key: "v4", name: "Four", rule: { type: "total_visits", count: 4 }, xp: 0 },
      ],
    });
    expect(nextBadge(weekly(3, p), p, { clock: at("2026-11-20T10:00:00") })).toMatchObject({ key: "v4", current: 3, target: 4 });
  });
});

describe("Sana'a Cafe defaults", () => {
  const p = parseProgram(sanaaCafe.program);
  it("reaches Regular on the 4th weekly visit", () => {
    const s3 = weekly(3, p);
    expect(progressFor(s3.xp, p).level.name).toBe("Guest");
    const out = visit(s3, "2026-11-23T10:00:00", p);
    expect(progressFor(out.state.xp, p).level.name).toBe("Regular");
    expect(out.rewards.map((r) => r.name)).toContain("Free pastry");
  });
  it("legacy programs (minVisits) still load", () => {
    const legacy = parseProgram({ levels: [{ key: "a", name: "A", minVisits: 0 }, { key: "b", name: "B", minVisits: 4 }], surpriseReward: { enabled: true, chance: 0.05, name: "Cookie", valueCents: 300, costCents: 60 } });
    expect(legacy.levels[1].minXp).toBe(400);
    expect(legacy.mystery.enabled).toBe(true);
  });
});
