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
  const byName = (n: string) => data.customers.find((c) => c.phone === SHOWCASE.find((s) => s.firstName === n)!.phone)!;
  const liveCheckIn = (n: string) => {
    const out = checkIn(byName(n).state, program, { now, timeZone: tz }, () => 0.99);
    if (!out.ok) throw new Error("refused");
    return out;
  };

  it("creates showcase + crowd customers with visits, stamps and squads", () => {
    expect(data.customers.length).toBeGreaterThan(30);
    expect(data.visits.length).toBeGreaterThan(150);
    expect(new Set(data.customers.map((c) => c.phone)).size).toBe(data.customers.length);
    expect(data.customers.some((c) => Object.keys(c.state.game.stamps).length > 2)).toBe(true);
    expect(data.squads?.[0].members.length).toBe(3);
  });

  it("showcase stories hold up", () => {
    expect(liveCheckIn("Layla").events).toContainEqual({ type: "level_up", toLevel: "regular" });
    expect(data.rewards.filter((r) => r.customerIndex === data.customers.indexOf(byName("Omar")) && !r.redeemedAt).length).toBeGreaterThanOrEqual(3);
    expect(liveCheckIn("Maria").rewards.map((r) => r.kind)).toContain("welcome");
    expect(liveCheckIn("Noor").rewards.map((r) => r.kind)).toContain("birthday");
    expect(liveCheckIn("Sam").events.map((e) => e.type)).toContain("saver_used");
    expect(progressFor(byName("Jake").state.xp, program).isTopLevel).toBe(true);
    const zara = byName("Zara").state.game;
    expect(zara.mystery.filter((b) => !b.openedAt)).toHaveLength(1);
    expect(Object.keys(zara.stamps)).toEqual(expect.arrayContaining(["honey-latte", "maple-cold-brew"]));
  });

  it("is the same every time (fixed seed)", () => {
    expect(generateDemoData(program, tz, now)).toEqual(data);
  });
});
