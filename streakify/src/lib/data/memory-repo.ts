/**
 * In-memory storage. Used automatically when Supabase keys are missing, so the
 * app runs on your laptop (or as a Vercel demo) with zero setup.
 * Data resets when the server restarts. Not for real customers.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { seedCafes } from "../demo/cafes";
import { generateDemoData } from "../demo/generate";
import { parseBrand } from "../brand";
import { parseProgram, type Program } from "../program";
import { newStreakState } from "../streak/engine";
import { hashSecret } from "../secrets";
import {
  type Cafe,
  type AuditEntry,
  type CafePatch,
  type CustomerWrite,
  type PushSubscriptionRow,
  type Squad,
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
  squads: Squad[];
  push: (PushSubscriptionRow & { cafeId: string; customerId: string })[];
  wallet: { deviceLibraryId: string; passTypeId: string; serial: string; pushToken: string }[];
  cafes: Cafe[];
  customers: Customer[];
  rewards: StoredReward[];
  visits: StoredVisit[];
  sms: StoredSms[];
  jobs: Set<string>;
  audit: AuditEntry[];
};

const g = globalThis as unknown as { __streakifyMemoryDb?: Db };

function seedDb(): Db {
  const db: Db = { cafes: [], customers: [], rewards: [], visits: [], sms: [], jobs: new Set(), squads: [], push: [], wallet: [], audit: [] };
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
      ownerEmail: seed.ownerEmail,
      posProvider: "none",
      posConfig: {},
      status: seed.status,
      planPriceCents: seed.planPriceCents,
      setupFeePaid: false,
      address: null,
      ownerName: null,
      ownerPhone: null,
    };
    db.cafes.push(cafe);
    if (cafe.isDemo) loadDemo(db, cafe.id, generateDemoData(cafe.program, cafe.timezone));
  }
  return db;
}

function loadDemo(db: Db, cafeId: string, data: DemoDataset) {
  const ids = new Set(db.customers.filter((c) => c.cafeId === cafeId).map((c) => c.id));
  db.customers = db.customers.filter((c) => c.cafeId !== cafeId);
  db.squads = db.squads.filter((q) => q.cafeId !== cafeId);
  db.push = db.push.filter((x) => x.cafeId !== cafeId);
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
      updatedAt: c.createdAt,
      version: 0,
      referralCode: referralCode(),
      squadId: null,
    });
    return id;
  });
  for (const q of data.squads ?? []) {
    const squad: Squad = { id: randomUUID(), cafeId, name: q.name, code: q.code, streakWeeks: q.streakWeeks, lastCompleteWeek: q.lastCompleteWeek };
    db.squads.push(squad);
    for (const i of q.members) {
      const c = db.customers.find((x) => x.id === newIds[i]);
      if (c) c.squadId = squad.id;
    }
  }
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

/** 6-character code like "K7Q2XD" (no look-alike letters). */
export function referralCode(): string {
  const abc = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(6);
  return Array.from(bytes, (b) => abc[b % abc.length]).join("");
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
    const state = newStreakState(birthday);
    state.game.referredBy = input.referredBy ?? null;
    let code = referralCode();
    while (this.db.customers.some((c) => c.cafeId === input.cafeId && c.referralCode === code)) code = referralCode();
    const customer: Customer = {
      ...state,
      id: randomUUID(),
      cafeId: input.cafeId,
      phone: input.phone,
      firstName: input.firstName,
      publicToken: randomBytes(16).toString("hex"),
      leaderboardOptIn: input.leaderboardOptIn,
      smsOptIn: input.smsOptIn,
      createdAt: input.now.toISOString(),
      updatedAt: input.now.toISOString(),
      version: 0,
      referralCode: code,
      squadId: null,
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

  async applyUpdate(w: CustomerWrite) {
    const c = this.db.customers.find((x) => x.cafeId === w.cafeId && x.id === w.customerId);
    if (!c || c.version !== w.expectedVersion) throw new ConflictError();
    Object.assign(c, structuredClone(w.state), { version: c.version + 1, updatedAt: new Date().toISOString() });
    let visitId: string | null = null;
    if (w.visit) {
      visitId = randomUUID();
      this.db.visits.push({
        id: visitId,
        cafeId: w.cafeId,
        customerId: w.customerId,
        createdAt: w.visit.createdAt,
        localDate: w.visit.localDate,
        verified: false,
        posOrderId: null,
      });
    }
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
        earnedAt: w.meta.createdAt,
        earnedLocalDate: w.meta.localDate,
        redeemedAt: null,
        redeemedLocalDate: null,
      });
    }
    return { visitId };
  }

  async findCustomerByReferralCode(cafeId: string, code: string) {
    return copy(this.db.customers.find((x) => x.cafeId === cafeId && x.referralCode === code.toUpperCase()));
  }
  async getCustomerById(customerId: string) {
    return copy(this.db.customers.find((x) => x.id === customerId));
  }
  async getCafeById(cafeId: string) {
    return copy(this.db.cafes.find((x) => x.id === cafeId));
  }

  async createSquad(cafeId: string, name: string, code: string) {
    if (this.db.squads.some((q) => q.cafeId === cafeId && q.code === code)) throw new Error("Code taken");
    const q: Squad = { id: randomUUID(), cafeId, name, code, streakWeeks: 0, lastCompleteWeek: null };
    this.db.squads.push(q);
    return structuredClone(q);
  }
  async getSquad(cafeId: string, squadId: string) {
    return copy(this.db.squads.find((q) => q.cafeId === cafeId && q.id === squadId));
  }
  async getSquadByCode(cafeId: string, code: string) {
    return copy(this.db.squads.find((q) => q.cafeId === cafeId && q.code === code.toUpperCase()));
  }
  async listSquadMembers(cafeId: string, squadId: string) {
    return structuredClone(this.db.customers.filter((c) => c.cafeId === cafeId && c.squadId === squadId));
  }
  async setCustomerSquad(cafeId: string, customerId: string, squadId: string | null) {
    const c = this.db.customers.find((x) => x.cafeId === cafeId && x.id === customerId);
    if (c) c.squadId = squadId;
  }
  async completeSquadWeek(squadId: string, week: string) {
    const q = this.db.squads.find((x) => x.id === squadId);
    if (!q || (q.lastCompleteWeek && q.lastCompleteWeek >= week)) return null;
    const prev = new Date(`${week}T00:00:00Z`);
    prev.setUTCDate(prev.getUTCDate() - 7);
    q.streakWeeks = q.lastCompleteWeek === prev.toISOString().slice(0, 10) ? q.streakWeeks + 1 : 1;
    q.lastCompleteWeek = week;
    return q.streakWeeks;
  }

  async savePushSubscription(cafeId: string, customerId: string, sub: PushSubscriptionRow) {
    this.db.push = this.db.push.filter((p) => p.endpoint !== sub.endpoint);
    this.db.push.push({ ...sub, cafeId, customerId });
  }
  async listPushSubscriptions(cafeId: string, customerId: string) {
    return this.db.push.filter((p) => p.cafeId === cafeId && p.customerId === customerId).map(({ endpoint, p256dh, auth }) => ({ endpoint, p256dh, auth }));
  }
  async deletePushSubscription(endpoint: string) {
    this.db.push = this.db.push.filter((p) => p.endpoint !== endpoint);
  }

  async registerWalletDevice(deviceLibraryId: string, passTypeId: string, serial: string, pushToken: string) {
    const existing = this.db.wallet.find((w) => w.deviceLibraryId === deviceLibraryId && w.passTypeId === passTypeId && w.serial === serial);
    if (existing) {
      existing.pushToken = pushToken;
      return false;
    }
    this.db.wallet.push({ deviceLibraryId, passTypeId, serial, pushToken });
    return true;
  }
  async unregisterWalletDevice(deviceLibraryId: string, passTypeId: string, serial: string) {
    this.db.wallet = this.db.wallet.filter((w) => !(w.deviceLibraryId === deviceLibraryId && w.passTypeId === passTypeId && w.serial === serial));
  }
  async listWalletSerials(deviceLibraryId: string, passTypeId: string) {
    return this.db.wallet.filter((w) => w.deviceLibraryId === deviceLibraryId && w.passTypeId === passTypeId).map((w) => w.serial);
  }
  async listWalletPushTokens(serial: string) {
    return this.db.wallet.filter((w) => w.serial === serial).map(({ pushToken, passTypeId }) => ({ pushToken, passTypeId }));
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
    if (patch.slug && this.db.cafes.some((x) => x.id !== cafeId && x.slug === patch.slug)) throw new Error("That subdomain is already taken");
    Object.assign(c, structuredClone(patch));
    return structuredClone(c);
  }

  async ownerUpdateProgram(cafeId: string, program: Program) {
    const c = this.cafe(cafeId);
    c.program = { ...structuredClone(program), menu: c.program.menu };
  }

  async createCafe(input: NewCafe) {
    if (this.db.cafes.some((c) => c.slug === input.slug)) throw new Error("That subdomain is already taken");
    const cafe: Cafe = {
      ...structuredClone(input),
      id: randomUUID(),
      customDomain: null,
      posProvider: "none",
      posConfig: {},
      status: input.status ?? "trial",
      planPriceCents: input.planPriceCents ?? 0,
      setupFeePaid: input.setupFeePaid ?? false,
      address: input.address ?? null,
      ownerName: input.ownerName ?? null,
      ownerPhone: input.ownerPhone ?? null,
    };
    this.db.cafes.push(cafe);
    return structuredClone(cafe);
  }

  async deleteCafe(cafeId: string) {
    const db = this.db;
    const ids = new Set(db.customers.filter((c) => c.cafeId === cafeId).map((c) => c.id));
    db.cafes = db.cafes.filter((c) => c.id !== cafeId);
    db.customers = db.customers.filter((c) => c.cafeId !== cafeId);
    db.visits = db.visits.filter((v) => v.cafeId !== cafeId);
    db.rewards = db.rewards.filter((r) => !ids.has(r.customerId));
    db.squads = db.squads.filter((q) => q.cafeId !== cafeId);
    db.push = db.push.filter((x) => x.cafeId !== cafeId);
    db.sms = db.sms.filter((x) => x.cafeId !== cafeId);
  }

  async lastVisitAt(cafeId: string) {
    let last: string | null = null;
    for (const v of this.db.visits) if (v.cafeId === cafeId && (!last || v.createdAt > last)) last = v.createdAt;
    return last;
  }

  async audit(entry: AuditEntry) {
    this.db.audit.push({ ...entry, id: String(this.db.audit.length + 1), at: new Date().toISOString() });
    if (this.db.audit.length > 5000) this.db.audit.splice(0, 1000);
  }

  async listAudit(filter: { cafeId?: string; limit?: number }) {
    return this.db.audit
      .filter((a) => !filter.cafeId || a.cafeId === filter.cafeId)
      .slice(-(filter.limit ?? 50))
      .reverse()
      .map((a) => structuredClone(a));
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
