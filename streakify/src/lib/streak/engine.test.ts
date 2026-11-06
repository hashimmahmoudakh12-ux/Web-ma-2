/**
 * Tests for the streak rules. Run with:  npm test
 * Each test is a little story: "a customer visits on these days, expect this".
 * Dates use New York time; Nov 2, 2026 is a Monday.
 */
import { describe, expect, it } from "vitest";
import { sanaaCafe } from "../demo/cafes";
import { parseProgram } from "../program";
import { type StreakState, checkIn, newStreakState, streakRisk } from "./engine";
import { nextTimeLine, progressLine, riskLine } from "./messages";

const program = parseProgram(sanaaCafe.program);
const tz = "America/New_York";
const noSurprise = () => 0.99;

/** Local New York time -> clock */
const at = (local: string) => ({ now: new Date(`${local}-05:00`), timeZone: tz });

function visit(state: StreakState, local: string, rng = noSurprise) {
  const out = checkIn(state, program, at(local), rng);
  if (!out.ok) throw new Error(`check-in at ${local} was refused`);
  return out;
}

/** Visits once a week starting Monday Nov 2 (Mondays and +7 days). */
function weeklyVisits(n: number, start = "2026-11-02") {
  let s = newStreakState();
  const startMs = new Date(`${start}T12:00:00Z`).getTime();
  for (let i = 0; i < n; i++) {
    const day = new Date(startMs + i * 7 * 86_400_000).toISOString().slice(0, 10);
    s = visit(s, `${day}T10:00:00`).state;
  }
  return s;
}

describe("check-in basics", () => {
  it("first visit starts the streak with no reward", () => {
    const out = visit(newStreakState(), "2026-11-02T09:00:00");
    expect(out.state.streakVisits).toBe(1);
    expect(out.state.totalVisits).toBe(1);
    expect(out.state.streakWeeks).toBe(1);
    expect(out.rewards).toEqual([]);
  });

  it("second visit gives the $1.50 welcome reward", () => {
    const s1 = visit(newStreakState(), "2026-11-02T09:00:00").state;
    const out = visit(s1, "2026-11-04T09:00:00");
    expect(out.rewards.map((r) => r.kind)).toEqual(["welcome"]);
    expect(out.rewards[0].valueCents).toBe(150);
    expect(out.state.streakWeeks).toBe(1); // same week, still 1 week
  });

  it("blocks a second check-in within 3 hours (anti-cheat)", () => {
    const s1 = visit(newStreakState(), "2026-11-02T09:00:00").state;
    const blocked = checkIn(s1, program, at("2026-11-02T11:59:00"));
    expect(blocked.ok).toBe(false);
    const allowed = checkIn(s1, program, at("2026-11-02T12:00:00"));
    expect(allowed.ok).toBe(true);
  });

  it("reaching Silver gives a free pastry, Gold a free drink", () => {
    const s3 = weeklyVisits(3);
    const silver = visit(s3, "2026-11-23T10:00:00");
    expect(silver.state.streakVisits).toBe(4);
    expect(silver.rewards).toContainEqual(expect.objectContaining({ kind: "level", name: "Free pastry" }));
    expect(silver.events).toContainEqual({ type: "level_up", toLevel: "silver" });

    const s7 = weeklyVisits(7);
    const gold = visit(s7, "2026-12-21T10:00:00");
    expect(gold.rewards).toContainEqual(expect.objectContaining({ kind: "level", name: "Free drink" }));
  });
});

describe("missing weeks", () => {
  it("uses the monthly streak saver for the first missed week", () => {
    const s = weeklyVisits(5); // visits Nov 2, 9, 16, 23, 30 -> 5 streak visits (Silver)
    // Skip week of Dec 7, come back Dec 14
    const out = visit(s, "2026-12-14T10:00:00");
    expect(out.events).toEqual([{ type: "saver_used", week: "2026-12-07" }]);
    expect(out.state.streakVisits).toBe(6);
    expect(out.state.streakWeeks).toBe(6); // streak protected
  });

  it("second missed week in the same month drops ONE level", () => {
    const s = weeklyVisits(9); // Nov 2 .. Dec 28 -> 9 visits = Gold
    expect(s.streakVisits).toBe(9);
    // Miss week of Jan 4 (saver for January) and Jan 11 (no saver left) -> drop Gold -> Silver
    const out = visit(s, "2027-01-18T10:00:00");
    expect(out.events).toEqual([
      { type: "saver_used", week: "2027-01-04" },
      { type: "level_drop", week: "2027-01-11", fromLevel: "gold", toLevel: "silver" },
    ]);
    expect(out.before.streakVisits).toBe(4); // back to start of Silver
    expect(out.state.streakVisits).toBe(5); // + today's visit
    expect(out.state.streakWeeks).toBe(1);
  });

  it("long absence drops one level per missed week, never below zero", () => {
    const s = weeklyVisits(9);
    const out = visit(s, "2027-04-05T10:00:00");
    expect(out.before.streakVisits).toBe(0);
    expect(out.state.streakVisits).toBe(1);
    expect(out.state.totalVisits).toBe(10); // lifetime count never drops
  });

  it("re-reaching a level after a drop earns its reward again", () => {
    const s = weeklyVisits(9);
    let state = visit(s, "2027-01-18T10:00:00").state; // now Silver, 5 visits
    let rewards: string[] = [];
    for (const d of ["2027-01-25", "2027-02-01", "2027-02-08"]) {
      const out = visit(state, `${d}T10:00:00`);
      state = out.state;
      rewards = rewards.concat(out.rewards.map((r) => r.name));
    }
    expect(state.streakVisits).toBe(8);
    expect(rewards).toEqual(["Free drink"]);
  });
});

describe("time zones", () => {
  it("11pm Sunday in New York counts for that week even though it's Monday in UTC", () => {
    const s1 = visit(newStreakState(), "2026-11-02T09:00:00").state;
    const out = visit(s1, "2026-11-08T23:00:00");
    expect(out.visit.weekStart).toBe("2026-11-02");
    expect(out.visit.localDate).toBe("2026-11-08");
  });
});

describe("birthday and surprise rewards", () => {
  it("gives the birthday drink once, within 7 days after the birthday", () => {
    let s = newStreakState({ month: 11, day: 3 });
    s = visit(s, "2026-11-02T09:00:00").state; // day before: nothing
    const onDay = visit(s, "2026-11-09T09:00:00");
    expect(onDay.rewards.map((r) => r.kind)).toContain("birthday");
    const again = visit(onDay.state, "2026-11-10T09:00:00");
    expect(again.rewards.map((r) => r.kind)).not.toContain("birthday");
  });

  it("late-December birthday still counts in early January", () => {
    const s = newStreakState({ month: 12, day: 30 });
    const out = visit(s, "2027-01-02T09:00:00");
    expect(out.rewards.map((r) => r.kind)).toContain("birthday");
    expect(out.state.birthdayRewardYear).toBe(2026);
  });

  it("surprise reward fires when the random roll is under the chance", () => {
    const out = visit(newStreakState(), "2026-11-02T09:00:00", () => 0.01);
    expect(out.rewards.map((r) => r.kind)).toEqual(["surprise"]);
  });
});

describe("messages", () => {
  it("progress bar text", () => {
    const s = weeklyVisits(2);
    expect(progressLine(s, program)).toBe("2 more visits until your free pastry.");
    expect(progressLine(weeklyVisits(15), program)).toBe("You're at Mokha Legend: secret menu unlocked");
  });

  it("come back by next week's last day", () => {
    const s = weeklyVisits(1); // visited Mon Nov 2 -> goal met this week
    const line = nextTimeLine(s, program, at("2026-11-02T10:05:00"), "USD");
    expect(line).toBe("Come back by Sunday, Nov 15 to save $1.50 next time.");
  });

  it("warns when the streak ends tomorrow", () => {
    const s = weeklyVisits(3); // last visit Mon Nov 16, nothing in week of Nov 23
    // Use up November's saver first so the warning shows the real loss.
    const noSaver = { ...s, saverMonth: "2026-11", saversUsedInMonth: 1 };
    expect(streakRisk(noSaver, program, at("2026-11-27T12:00:00"))).toBeNull(); // Friday: 2 days left
    const sat = at("2026-11-28T12:00:00");
    expect(streakRisk(noSaver, program, sat)?.daysLeft).toBe(1);
    expect(riskLine(noSaver, program, sat, "USD")).toBe("Your streak ends tomorrow, that's $4.50 you'll lose.");
    expect(riskLine(s, program, sat, "USD")).toContain("streak saver will cover you");
  });
});
