/**
 * In-memory storage. Used automatically when Supabase keys are missing, so the
 * app runs on your laptop (or as a Vercel demo) with zero setup.
 * Data resets when the server restarts. Not for real customers.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { seedCafes } from "../demo/cafes";
import { generateDemoData } from "../demo/generate";
import { parseBrand } from "../brand";
import { parseProgram } from "../program";
import { newStreakState } from "../streak/engine";
import { hashSecret } from "../auth";
import {
  type Cafe,
  type CafePatch,
  type CheckInWrite,
  ConflictError,
  type Customer,
  type DemoDataset,
  DuplicatePhoneError,
  type NewCafe,
  type NewCustomer,
  type Repo,
  type Reward,
  type RewardRow,
  type SmsLogEntry,
  type VisitRow,
} from "./types";

type StoredReward = Reward & { earnedLocalDate: string; redeemedLocalDate: string | null };
type StoredVisit = VisitRow & { cafeId: string; posOrderId: string | null };
type StoredSms = SmsLogEntry & { id: string };

type Db = {
  cafes: Cafe[];
  customers: Customer[];
  rewards: StoredReward[];
  visits: StoredVisit[];
  sms: StoredSms[];
  jobs: Set<string>;
};

const g = globalThis as unknown as { __streakifyMemoryDb?: Db };

function seedDb(): Db {
  const db: Db = { cafes: [], customers: [], rewards: [], visits: [], sms: [], jobs: new Set() };
  g.__streakifyMemoryDb = db;
  for (const seed of seedCafes) {
    const cafe: Cafe = {
      id: randomUUID(),
      slug: seed.slug,
      name: seed.name,
      customDomain: null,
      timezone: seed.timezone,
      currency: seed.currency,
      isDemo: seed.isDemo,
      brand: parseBrand(seed.brand),
      program: parseProgram(seed.program),
      counterPinHash: hashSecret(seed.counterPin),
      ownerPasswordHash: hashSecret(seed.ownerPassword),
      ownerEmail: seed.ownerEmail,
      posProvider: "none",
      posConfig: {},
    };
    db.cafes.push(cafe);
    if (cafe.isDemo) loadDemo(db, cafe.id, generateDemoData(cafe.program, cafe.timezone));
  }
  return db;
}

function loadDemo(db: Db, cafeId: string, data: DemoDataset) {
  const ids = new Set(db.customers.filter((c) => c.cafeId === cafeId).map((c) => c.id));
  db.customers = db.customers.filter((c) => c.cafeId !== cafeId);
  db.rewards = db.rewards.filter((r) => !ids.has(r.customerId));
  db.visits = db.visits.filter((v) => v.cafeId !== cafeId);
  const newIds = data.customers.map((c) => {
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
    db.visits.push({
      id: randomUUID(),
      cafeId,
      customerId: newIds[v.customerIndex],
      createdAt: v.createdAt,
      localDate: v.localDate,
      verified: false,
      posOrderId: null,
    });
  }
  for (const r of data.rewards) {
    db.rewards.push({
      id: randomUUID(),
      cafeId,
      customerId: newIds[r.customerIndex],
      kind: r.kind as Reward["kind"],
      name: r.name,
      valueCents: r.valueCents,
      costCents: r.costCents,
      status: r.redeemedAt ? "redeemed" : "available",
      earnedAt: r.earnedAt,
      earnedLocalDate: r.earnedLocalDate,
      redeemedAt: r.redeemedAt,
      redeemedLocalDate: r.redeemedLocalDate,
    });
  }
}

const copy = <T,>(x: T | undefined): T | null => (x ? structuredClone(x) : null);

export class MemoryRepo implements Repo {
  readonly kind = "memory" as const;

  private get db(): Db {
    return g.__streakifyMemoryDb ?? seedDb();
  }

  private cafe(cafeId: string) {
    const c = this.db.cafes.find((x) => x.id === cafeId);
    if (!c) throw new Error("Unknown café");
    return c;
  }

  async getCafeBySlug(slug: string) {
    return copy(this.db.cafes.find((c) => c.slug === slug));
  }
  async getCafeByDomain(domain: string) {
    return copy(this.db.cafes.find((c) => c.customDomain === domain));
  }
  async listCafes() {
    return structuredClone(this.db.cafes).sort((a, b) => a.name.localeCompare(b.name));
  }

  async findCustomerByPhone(cafeId: string, phone: string) {
    return copy(this.db.customers.find((x) => x.cafeId === cafeId && x.phone === phone));
  }
  async getCustomer(cafeId: string, customerId: string) {
    return copy(this.db.customers.find((x) => x.cafeId === cafeId && x.id === customerId));
  }
  async getCustomerByToken(cafeId: string, token: string) {
    return copy(this.db.customers.find((x) => x.cafeId === cafeId && x.publicToken === token));
  }
  async listCustomers(cafeId: string) {
    return structuredClone(this.db.customers.filter((c) => c.cafeId === cafeId));
  }

  async deleteCustomer(cafeId: string, customerId: string) {
    const db = this.db;
    db.customers = db.customers.filter((c) => !(c.cafeId === cafeId && c.id === customerId));
    db.visits = db.visits.filter((v) => v.customerId !== customerId);
    db.rewards = db.rewards.filter((r) => r.customerId !== customerId);
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
    return structuredClone(customer);
  }

  async updateCustomerPrefs(cafeId: string, customerId: string, prefs: { leaderboardOptIn?: boolean; smsOptIn?: boolean }) {
    const c = this.db.customers.find((x) => x.cafeId === cafeId && x.id === customerId);
    if (!c) return;
    if (prefs.leaderboardOptIn !== undefined) c.leaderboardOptIn = prefs.leaderboardOptIn;
    if (prefs.smsOptIn !== undefined) c.smsOptIn = prefs.smsOptIn;
  }

  async applyCheckIn(w: CheckInWrite) {
    const c = this.db.customers.find((x) => x.cafeId === w.cafeId && x.id === w.customerId);
    if (!c || c.version !== w.expectedVersion) throw new ConflictError();
    Object.assign(c, w.state, { version: c.version + 1 });
    const visitId = randomUUID();
    this.db.visits.push({
      id: visitId,
      cafeId: w.cafeId,
      customerId: w.customerId,
      createdAt: w.visit.createdAt,
      localDate: w.visit.localDate,
      verified: false,
      posOrderId: null,
    });
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
        earnedLocalDate: w.visit.localDate,
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
      .map((r) => structuredClone(r));
  }

  async redeemReward(cafeId: string, customerId: string, rewardId: string, now: Date, localDate: string) {
    const r = this.db.rewards.find((x) => x.id === rewardId && x.cafeId === cafeId && x.customerId === customerId);
    if (!r || r.status !== "available") return null;
    r.status = "redeemed";
    r.redeemedAt = now.toISOString();
    r.redeemedLocalDate = localDate;
    return structuredClone(r);
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

  async grantReward(cafeId: string, customerId: string, reward: { kind: Reward["kind"]; name: string; valueCents: number; costCents: number }, now: Date, localDate: string) {
    this.db.rewards.push({
      ...reward,
      id: randomUUID(),
      cafeId,
      customerId,
      status: "available",
      earnedAt: now.toISOString(),
      earnedLocalDate: localDate,
      redeemedAt: null,
      redeemedLocalDate: null,
    });
  }

  async listVisits(cafeId: string, from: string, to: string): Promise<VisitRow[]> {
    return this.db.visits
      .filter((v) => v.cafeId === cafeId && v.localDate >= from && v.localDate <= to)
      .map(({ id, customerId, localDate, createdAt, verified }) => ({ id, customerId, localDate, createdAt, verified }));
  }

  async listRewardActivity(cafeId: string, from: string, to: string): Promise<RewardRow[]> {
    const inRange = (d: string | null) => d !== null && d >= from && d <= to;
    return this.db.rewards
      .filter((r) => r.cafeId === cafeId && (inRange(r.earnedLocalDate) || inRange(r.redeemedLocalDate)))
      .map((r) => ({
        id: r.id,
        customerId: r.customerId,
        kind: r.kind,
        name: r.name,
        valueCents: r.valueCents,
        costCents: r.costCents,
        status: r.status,
        earnedLocalDate: r.earnedLocalDate,
        redeemedLocalDate: r.redeemedLocalDate,
      }));
  }

  async updateCafe(cafeId: string, patch: CafePatch) {
    const c = this.cafe(cafeId);
    if (patch.customDomain && this.db.cafes.some((x) => x.id !== cafeId && x.customDomain === patch.customDomain)) {
      throw new Error("Another café already uses that domain");
    }
    Object.assign(c, structuredClone(patch));
    return structuredClone(c);
  }

  async createCafe(input: NewCafe) {
    if (this.db.cafes.some((c) => c.slug === input.slug)) throw new Error("That subdomain is already taken");
    const cafe: Cafe = { ...structuredClone(input), id: randomUUID(), customDomain: null, posProvider: "none", posConfig: {} };
    this.db.cafes.push(cafe);
    return structuredClone(cafe);
  }

  async claimJob(cafeId: string, job: string, period: string) {
    const key = `${cafeId}|${job}|${period}`;
    if (this.db.jobs.has(key)) return false;
    this.db.jobs.add(key);
    return true;
  }

  async claimSms(entry: SmsLogEntry) {
    if (this.db.sms.some((s) => s.cafeId === entry.cafeId && s.dedupeKey === entry.dedupeKey)) return null;
    const id = randomUUID();
    this.db.sms.push({ ...entry, id });
    return id;
  }

  async finishSms(id: string, result: { status: SmsLogEntry["status"]; providerId?: string | null; error?: string | null }) {
    const s = this.db.sms.find((x) => x.id === id);
    if (s) Object.assign(s, result);
  }

  async optOutPhoneEverywhere(phone: string) {
    let n = 0;
    for (const c of this.db.customers) {
      if (c.phone === phone && c.smsOptIn) {
        c.smsOptIn = false;
        n++;
      }
    }
    return n;
  }

  async markVisitVerified(cafeId: string, visitId: string, posOrderId: string) {
    const v = this.db.visits.find((x) => x.cafeId === cafeId && x.id === visitId);
    if (v) {
      v.verified = true;
      v.posOrderId = posOrderId;
    }
  }

  async replaceDemoData(cafeId: string, data: DemoDataset) {
    if (!this.cafe(cafeId).isDemo) throw new Error("Only demo cafés can be reset");
    loadDemo(this.db, cafeId, data);
  }
}
