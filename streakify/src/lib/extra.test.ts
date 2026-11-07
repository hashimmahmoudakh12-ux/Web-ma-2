/** Tests for logins, stats math and the profit view. */
import { describe, expect, it } from "vitest";
import { hashSecret, makeToken, verifySecret, verifyToken } from "./secrets";
import { demoCafe } from "./demo/cafes";
import { generateDemoData } from "./demo/generate";
import { parseBrand } from "./brand";
import { parseProgram } from "./program";
import { computeStats } from "./stats";
import { monthRange, previousMonth } from "./time";
import type { Cafe, Customer, RewardRow, VisitRow } from "./data/types";

describe("auth", () => {
  it("hashes and checks secrets", () => {
    const h = hashSecret("2580");
    expect(verifySecret("2580", h)).toBe(true);
    expect(verifySecret("2581", h)).toBe(false);
  });
  it("signed tokens are bound to their scope and expire", () => {
    const now = new Date("2026-11-06T12:00:00Z");
    const { value } = makeToken("owner:abc", 1, now);
    expect(verifyToken(value, "owner:abc", now)).toBe(true);
    expect(verifyToken(value, "owner:xyz", now)).toBe(false);
    expect(verifyToken(value, "owner:abc", new Date("2026-11-08T12:00:00Z"))).toBe(false);
    expect(verifyToken(value.slice(0, -2) + "xx", "owner:abc", now)).toBe(false);
  });
});

describe("time", () => {
  it("month helpers", () => {
    expect(monthRange("2026-02-14")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(previousMonth("2026-01")).toBe("2025-12");
  });
});

describe("stats / profit view", () => {
  const program = parseProgram(demoCafe.program);
  const cafe: Cafe = {
    id: "c1", slug: "demo", name: "Demo", customDomain: null, timezone: "America/New_York", currency: "USD", isDemo: true,
    brand: parseBrand(demoCafe.brand), program, counterPinHash: null, ownerEmail: null, posProvider: "none", posConfig: {}, status: "active", planPriceCents: 0, setupFeePaid: false, address: null, ownerName: null, ownerPhone: null,
  };

  it("counts repeat visits and reward cost", () => {
    const customers = [
      { id: "a", createdAt: "2026-10-05T14:00:00Z", firstName: "A", xp: 300, streakVisits: 3, streakWeeks: 3, smsOptIn: true },
      { id: "b", createdAt: "2026-11-03T14:00:00Z", firstName: "B", xp: 200, streakVisits: 2, streakWeeks: 1, smsOptIn: false },
    ] as Customer[];
    const v = (customerId: string, localDate: string): VisitRow => ({ id: Math.random().toString(), customerId, localDate, createdAt: `${localDate}T14:00:00Z`, verified: false });
    const visits = [v("a", "2026-11-02"), v("a", "2026-11-09"), v("b", "2026-11-03"), v("b", "2026-11-05")];
    const rewards: RewardRow[] = [
      { id: "r1", customerId: "b", kind: "welcome", name: "$1.50 off", valueCents: 150, costCents: 150, status: "redeemed", earnedLocalDate: "2026-11-05", redeemedLocalDate: "2026-11-05" },
      { id: "r2", customerId: "a", kind: "level", name: "Free pastry", valueCents: 450, costCents: 120, status: "available", earnedLocalDate: "2026-11-09", redeemedLocalDate: null },
    ];
    const s = computeStats(cafe, customers, visits, rewards, "2026-11-01", "2026-11-30");
    expect(s.totalVisits).toBe(4);
    expect(s.newMembers).toBe(1);
    expect(s.repeatVisits).toBe(3); // B's first visit isn't a repeat
    expect(s.rewardCostCents).toBe(150); // only USED rewards cost money
    expect(s.extraRevenueCents).toBe(3 * program.averageTicketCents);
    expect(s.outstandingRewards).toBe(1);
    expect(s.visitsByDay).toHaveLength(30);
  });

  it("works on a full demo month", () => {
    const now = new Date("2026-11-20T12:00:00-05:00");
    const data = generateDemoData(program, cafe.timezone, now);
    const customers = data.customers.map((c, i) => ({ ...c.state, id: String(i), cafeId: "c1", phone: c.phone, firstName: c.firstName, publicToken: "t", leaderboardOptIn: true, smsOptIn: c.smsOptIn, createdAt: c.createdAt, updatedAt: c.createdAt, version: 0, referralCode: "X", squadId: null }));
    const visits = data.visits.map((x, i) => ({ id: String(i), customerId: String(x.customerIndex), localDate: x.localDate, createdAt: x.createdAt, verified: false }));
    const rewards = data.rewards.map((r, i) => ({ id: String(i), customerId: String(r.customerIndex), kind: r.kind as RewardRow["kind"], name: r.name, valueCents: r.valueCents, costCents: r.costCents, status: (r.redeemedAt ? "redeemed" : "available") as RewardRow["status"], earnedLocalDate: r.earnedLocalDate, redeemedLocalDate: r.redeemedLocalDate }));
    const s = computeStats(cafe, customers, visits, rewards, "2026-11-01", "2026-11-30");
    expect(s.totalVisits).toBeGreaterThan(20);
    expect(s.extraRevenueCents).toBeGreaterThan(s.rewardCostCents);
    expect(s.topRegulars[0].visits).toBeGreaterThanOrEqual(s.topRegulars[1].visits);
  });
});
