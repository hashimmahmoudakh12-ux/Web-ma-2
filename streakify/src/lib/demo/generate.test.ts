import { describe, expect, it } from "vitest";
import { demoCafe } from "./cafes";
import { generateDemoData, SHOWCASE } from "./generate";
import { parseProgram } from "../program";
import { checkIn, progressFor } from "../streak/engine";

const program = parseProgram(demoCafe.program);
const tz = demoCafe.timezone;
// A Wednesday at noon New York time
const now = new Date("2026-11-11T12:00:00-05:00");

describe("demo data", () => {
  const data = generateDemoData(program, tz, now);
  const byPhone = (p: string) => data.customers.find((c) => c.phone === p)!;

  it("creates showcase + crowd customers with visits", () => {
    expect(data.customers.length).toBeGreaterThan(30);
    expect(data.visits.length).toBeGreaterThan(150);
    expect(new Set(data.customers.map((c) => c.phone)).size).toBe(data.customers.length);
  });

  it("showcase stories hold up", () => {
    const layla = byPhone(SHOWCASE[0].phone);
    expect(progressFor(layla.state.streakVisits, program).visitsToTarget).toBe(1);

    const omar = byPhone(SHOWCASE[1].phone);
    expect(omar.state.streakVisits).toBe(7);

    const maria = byPhone(SHOWCASE[2].phone);
    const out = checkIn(maria.state, program, { now, timeZone: tz }, () => 0.99);
    expect(out.ok && out.rewards.map((r) => r.kind)).toEqual(["welcome"]);

    const noor = byPhone(SHOWCASE[3].phone);
    const nOut = checkIn(noor.state, program, { now, timeZone: tz }, () => 0.99);
    expect(nOut.ok && nOut.rewards.map((r) => r.kind)).toContain("birthday");

    const sam = byPhone(SHOWCASE[4].phone);
    const sOut = checkIn(sam.state, program, { now, timeZone: tz }, () => 0.99);
    expect(sOut.ok && sOut.events.map((e) => e.type)).toEqual(["saver_used"]);

    const jake = byPhone(SHOWCASE[5].phone);
    expect(progressFor(jake.state.streakVisits, program).isTopLevel).toBe(true);
  });

  it("is the same every time (fixed seed)", () => {
    expect(generateDemoData(program, tz, now)).toEqual(data);
  });
});
