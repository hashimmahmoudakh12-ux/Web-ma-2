/**
 * In-memory storage. Used automatically when Supabase keys are missing, so the
 * app runs on your laptop with zero setup. Data resets when the server restarts.
 * Never used in production.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { seedCafes } from "../demo/cafes";
import { generateDemoData } from "../demo/generate";
import { parseBrand } from "../brand";
import { parseProgram } from "../program";
import { newStreakState } from "../streak/engine";
import { hashPin } from "../counter-auth";
import {
  type Cafe,
  type CheckInWrite,
  ConflictError,
  type Customer,
  type DemoDataset,
  DuplicatePhoneError,
  type NewCustomer,
  type Repo,
  type Reward,
} from "./types";

type StoredReward = Reward & { redeemedLocalDate: string | null };
type StoredVisit = { id: string; cafeId: string; customerId: string; createdAt: string; localDate: string };

type Db = { cafes: Cafe[]; customers: Customer[]; rewards: StoredReward[]; visits: StoredVisit[] };

function newDb(): Db {
  const db: Db = { cafes: [], customers: [], rewards: [], visits: [] };
  for (const seed of seedCafes) {
    db.cafes.push({
      id: randomUUID(),
      slug: seed.slug,
      name: seed.name,
      customDomain: null,
      timezone: seed.timezone,
      currency: seed.currency,
      isDemo: seed.isDemo,
      brand: parseBrand(seed.brand),
      program: parseProgram(seed.program),
      counterPinHash: hashPin(seed.counterPin),
      posProvider: "none",
    });
  }
  return db;
}

// Survive Next.js hot reloads in development by parking the data on globalThis.
const g = globalThis as unknown as { __streakifyMemoryDb?: Db };

export class MemoryRepo implements Repo {
  readonly kind = "memory" as const;

  private get db(): Db {
    if (!g.__streakifyMemoryDb) {
      g.__streakifyMemoryDb = newDb();
      for (const cafe of g.__streakifyMemoryDb.cafes.filter((c) => c.isDemo)) {
        this.replaceDemoDataSync(cafe.id, generateDemoData(cafe.program, cafe.timezone));
      }
    }
    return g.__streakifyMemoryDb;
  }

  async getCafeBySlug(slug: string) {
    return this.db.cafes.find((c) => c.slug === slug) ?? null;
  }
  async getCafeByDomain(domain: string) {
    return this.db.cafes.find((c) => c.customDomain === domain) ?? null;
  }
  async listCafes() {
    return [...this.db.cafes];
  }

  async findCustomerByPhone(cafeId: string, phone: string) {
    const c = this.db.customers.find((x) => x.cafeId === cafeId && x.phone === phone);
    return c ? { ...c } : null;
  }
  async getCustomer(cafeId: string, customerId: string) {
    const c = this.db.customers.find((x) => x.cafeId === cafeId && x.id === customerId);
    return c ? { ...c } : null;
  }

  async createCustomer(input: NewCustomer): Promise<Customer> {
    if (this.db.customers.some((c) => c.cafeId === input.cafeId && c.phone === input.phone)) {
      throw new DuplicatePhoneError();
    }
    const birthday = input.birthdayMonth && input.birthdayDay ? { month: input.birthdayMonth, day: input.birthdayDay } : null;
    const customer: Customer = {
      ...newStreakState(birthday),
      id: randomUUID(),
      cafeId: input.cafeId,
      phone: input.phone,
      firstName: input.firstName,
      publicToken: randomBytes(16).toString("hex"),
      leaderboardOptIn: input.leaderboardOptIn,
      smsOptIn: input.smsOptIn,
      createdAt: input.now.toISOString(),
      version: 0,
    };
    this.db.customers.push(customer);
    return { ...customer };
  }

  async applyCheckIn(w: CheckInWrite) {
    const c = this.db.customers.find((x) => x.cafeId === w.cafeId && x.id === w.customerId);
    if (!c || c.version !== w.expectedVersion) throw new ConflictError();
    Object.assign(c, w.state, { version: c.version + 1 });
    const visitId = randomUUID();
    this.db.visits.push({ id: visitId, cafeId: w.cafeId, customerId: w.customerId, createdAt: w.visit.createdAt, localDate: w.visit.localDate });
    for (const r of w.rewards) {
      this.db.rewards.push({
        id: randomUUID(),
        cafeId: w.cafeId,
        customerId: w.customerId,
        kind: r.kind as Reward["kind"],
        name: r.name,
        valueCents: r.valueCents,
        costCents: r.costCents,
        status: "available",
        earnedAt: w.visit.createdAt,
        redeemedAt: null,
        redeemedLocalDate: null,
      });
    }
    return { visitId };
  }

  async listAvailableRewards(cafeId: string, customerId: string) {
    return this.db.rewards
      .filter((r) => r.cafeId === cafeId && r.customerId === customerId && r.status === "available")
      .sort((a, b) => a.earnedAt.localeCompare(b.earnedAt))
      .map((r) => ({ ...r }));
  }

  async redeemReward(cafeId: string, customerId: string, rewardId: string, now: Date, localDate: string) {
    const r = this.db.rewards.find((x) => x.id === rewardId && x.cafeId === cafeId && x.customerId === customerId);
    if (!r || r.status !== "available") return null;
    r.status = "redeemed";
    r.redeemedAt = now.toISOString();
    r.redeemedLocalDate = localDate;
    return { ...r };
  }

  async savings(cafeId: string, customerId: string, localDate: string) {
    let totalCents = 0;
    let todayCents = 0;
    for (const r of this.db.rewards) {
      if (r.cafeId !== cafeId || r.customerId !== customerId || r.status !== "redeemed") continue;
      totalCents += r.valueCents;
      if (r.redeemedLocalDate === localDate) todayCents += r.valueCents;
    }
    return { totalCents, todayCents };
  }

  async replaceDemoData(cafeId: string, data: DemoDataset) {
    this.replaceDemoDataSync(cafeId, data);
  }

  private replaceDemoDataSync(cafeId: string, data: DemoDataset) {
    const db = g.__streakifyMemoryDb!;
    const cafe = db.cafes.find((c) => c.id === cafeId);
    if (!cafe?.isDemo) throw new Error("Only demo cafés can be reset");
    db.customers = db.customers.filter((c) => c.cafeId !== cafeId);
    db.rewards = db.rewards.filter((r) => r.cafeId !== cafeId);
    db.visits = db.visits.filter((v) => v.cafeId !== cafeId);
    const ids = data.customers.map((c) => {
      const id = randomUUID();
      db.customers.push({
        ...c.state,
        id,
        cafeId,
        phone: c.phone,
        firstName: c.firstName,
        publicToken: randomBytes(16).toString("hex"),
        leaderboardOptIn: c.leaderboardOptIn,
        smsOptIn: c.smsOptIn,
        createdAt: c.createdAt,
        version: 0,
      });
      return id;
    });
    for (const v of data.visits) {
      db.visits.push({ id: randomUUID(), cafeId, customerId: ids[v.customerIndex], createdAt: v.createdAt, localDate: v.localDate });
    }
    for (const r of data.rewards) {
      db.rewards.push({
        id: randomUUID(),
        cafeId,
        customerId: ids[r.customerIndex],
        kind: r.kind as Reward["kind"],
        name: r.name,
        valueCents: r.valueCents,
        costCents: r.costCents,
        status: r.redeemedAt ? "redeemed" : "available",
        earnedAt: r.earnedAt,
        redeemedAt: r.redeemedAt,
        redeemedLocalDate: r.redeemedLocalDate,
      });
    }
  }
}
