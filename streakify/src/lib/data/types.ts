/**
 * The shapes of our data, as the app sees them (camelCase).
 * The database uses snake_case; supabase-repo.ts translates between the two.
 */
import type { Brand } from "../brand";
import type { Program } from "../program";
import type { RewardKind, StreakEvent, StreakState } from "../streak/engine";

export type Cafe = {
  id: string;
  slug: string;
  name: string;
  customDomain: string | null;
  timezone: string;
  currency: string;
  isDemo: boolean;
  brand: Brand;
  program: Program;
  counterPinHash: string | null;
  ownerEmail: string | null;
  posProvider: "none" | "toast";
  posConfig: Record<string, unknown>;
  status: CafeStatus;
  planPriceCents: number;
  setupFeePaid: boolean;
  address: string | null;
  ownerName: string | null;
  ownerPhone: string | null;
};

export type CafeStatus = "trial" | "active" | "paused" | "cancelled";
/** Paused/cancelled cafés keep all data but stop check-ins and rewards. */
export const isLive = (c: Pick<Cafe, "status">) => c.status === "trial" || c.status === "active";

export type AuditEntry = {
  id?: string;
  at?: string;
  actorId: string | null;
  actorEmail: string | null;
  actorRole: string | null;
  action: string;
  cafeId: string | null;
  details?: Record<string, unknown>;
  ip?: string | null;
};

export type CafePatch = Partial<
  Pick<
    Cafe,
    | "slug" | "name" | "customDomain" | "timezone" | "brand" | "program" | "counterPinHash" | "ownerEmail" | "posProvider" | "posConfig"
    | "status" | "planPriceCents" | "setupFeePaid" | "address" | "ownerName" | "ownerPhone" | "isDemo"
  >
>;

export type NewCafe = Pick<Cafe, "slug" | "name" | "timezone" | "currency" | "brand" | "program" | "isDemo"> & {
  counterPinHash: string;
  ownerEmail: string | null;
  status?: CafeStatus;
  planPriceCents?: number;
  setupFeePaid?: boolean;
  address?: string | null;
  ownerName?: string | null;
  ownerPhone?: string | null;
};

/** Raw rows for dashboards and reports (stats are computed in lib/stats.ts). */
export type VisitRow = { id: string; customerId: string; localDate: string; createdAt: string; verified: boolean };
export type RewardRow = {
  id: string;
  customerId: string;
  kind: Reward["kind"];
  name: string;
  valueCents: number;
  costCents: number;
  status: Reward["status"];
  earnedLocalDate: string;
  redeemedLocalDate: string | null;
};
export type SmsLogEntry = {
  cafeId: string;
  customerId: string | null;
  phone: string;
  dedupeKey: string;
  body: string;
  status: "sending" | "sent" | "dry_run" | "failed";
  providerId?: string | null;
  error?: string | null;
};

export type Customer = StreakState & {
  id: string;
  cafeId: string;
  phone: string; // E.164
  firstName: string;
  publicToken: string;
  leaderboardOptIn: boolean;
  smsOptIn: boolean;
  createdAt: string;
  updatedAt: string;
  version: number;
  referralCode: string; // friends type this in when they join
  squadId: string | null;
};

export type Squad = { id: string; cafeId: string; name: string; code: string; streakWeeks: number; lastCompleteWeek: string | null };

export type PushSubscriptionRow = { endpoint: string; p256dh: string; auth: string };

export type Reward = {
  id: string;
  cafeId: string;
  customerId: string;
  kind: RewardKind | "leaderboard";
  name: string;
  valueCents: number;
  costCents: number;
  status: "available" | "redeemed" | "void";
  earnedAt: string;
  redeemedAt: string | null;
};

export type NewCustomer = {
  cafeId: string;
  phone: string;
  firstName: string;
  birthdayMonth: number | null;
  birthdayDay: number | null;
  privacyVersion: string;
  smsOptIn: boolean;
  smsConsentText: string | null;
  leaderboardOptIn: boolean;
  referredBy?: string | null; // customer id of the friend whose code they used
  now: Date;
};

/** One atomic change to a customer (with or without a visit). */
export type CustomerWrite = {
  cafeId: string;
  customerId: string;
  expectedVersion: number;
  state: StreakState;
  meta: { createdAt: string; localDate: string };
  visit: {
    createdAt: string;
    localDate: string;
    weekStart: string;
    source: "counter" | "toast" | "demo";
    streakVisitsAfter: number;
    levelAfter: string;
    xp: number;
  } | null;
  rewards: { kind: string; levelKey?: string; name: string; valueCents: number; costCents: number }[];
  events: StreakEvent[];
};

/** Bulk data used to (re)fill the demo café. */
export type DemoDataset = {
  customers: (NewCustomer & { state: StreakState; createdAt: string })[];
  visits: { customerIndex: number; createdAt: string; localDate: string; weekStart: string; streakVisitsAfter: number; levelAfter: string; xp: number }[];
  /** Squads: lists of customer indexes. */
  squads?: { name: string; code: string; members: number[]; streakWeeks: number; lastCompleteWeek: string | null }[];
  rewards: {
    customerIndex: number;
    kind: string;
    levelKey?: string;
    name: string;
    valueCents: number;
    costCents: number;
    earnedAt: string;
    earnedLocalDate: string;
    redeemedAt: string | null;
    redeemedLocalDate: string | null;
  }[];
};

export class ConflictError extends Error {
  constructor() {
    super("The customer was updated at the same time. Please try again.");
  }
}

export class DuplicatePhoneError extends Error {
  constructor() {
    super("This phone number is already a member.");
  }
}

/**
 * Everything the app needs from storage. Two implementations:
 *  - SupabaseRepo: the real database (production).
 *  - MemoryRepo: keeps data in memory; used when Supabase isn't configured
 *    yet, so you can try the app (and demo mode) with zero setup.
 */
export interface Repo {
  readonly kind: "supabase" | "memory";
  getCafeBySlug(slug: string): Promise<Cafe | null>;
  getCafeByDomain(domain: string): Promise<Cafe | null>;
  listCafes(): Promise<Cafe[]>;

  findCustomerByPhone(cafeId: string, phone: string): Promise<Customer | null>;
  getCustomer(cafeId: string, customerId: string): Promise<Customer | null>;
  createCustomer(input: NewCustomer): Promise<Customer>;
  /** Saves a customer change all-or-nothing. Throws ConflictError if someone else changed them first. */
  applyUpdate(write: CustomerWrite): Promise<{ visitId: string | null }>;
  findCustomerByReferralCode(cafeId: string, code: string): Promise<Customer | null>;
  /** Any café — used by Wallet passes, whose serial number is the customer id. */
  getCustomerById(customerId: string): Promise<Customer | null>;
  getCafeById(cafeId: string): Promise<Cafe | null>;

  listAvailableRewards(cafeId: string, customerId: string): Promise<Reward[]>;
  /** Marks a reward redeemed. Returns null if it was already used / not found. */
  redeemReward(cafeId: string, customerId: string, rewardId: string, now: Date, localDate: string): Promise<Reward | null>;
  savings(cafeId: string, customerId: string, localDate: string): Promise<{ totalCents: number; todayCents: number }>;

  /** Wipes the demo café's customers and loads a fresh dataset. Demo cafés only. */
  replaceDemoData(cafeId: string, data: DemoDataset): Promise<void>;

  // ---- phase 2: customer page + leaderboard
  getCustomerByToken(cafeId: string, token: string): Promise<Customer | null>;
  updateCustomerPrefs(cafeId: string, customerId: string, prefs: { leaderboardOptIn?: boolean; smsOptIn?: boolean; smsConsentText?: string | null }): Promise<void>;
  listCustomers(cafeId: string): Promise<Customer[]>;
  /** Privacy request: removes a customer and all their visits/rewards. */
  deleteCustomer(cafeId: string, customerId: string): Promise<void>;
  /** Visits with local_date in [from, to] (inclusive). */
  listVisits(cafeId: string, from: string, to: string): Promise<VisitRow[]>;

  // ---- phase 3/4: dashboard, admin, reports
  /** Rewards earned OR redeemed with a local date in [from, to]. */
  listRewardActivity(cafeId: string, from: string, to: string): Promise<RewardRow[]>;
  updateCafe(cafeId: string, patch: CafePatch): Promise<Cafe>;
  /**
   * An OWNER changes their rewards. Keeps the menu (admin-only) as it was.
   * With Supabase this goes through the database function owner_update_program,
   * which checks the owner's login itself.
   */
  ownerUpdateProgram(cafeId: string, program: Program): Promise<void>;
  createCafe(input: NewCafe): Promise<Cafe>;
  /** Permanently deletes a café and ALL its data. */
  deleteCafe(cafeId: string): Promise<void>;
  /** Time of the most recent check-in (for "no check-ins in 3+ days" alerts). */
  lastVisitAt(cafeId: string): Promise<string | null>;
  audit(entry: AuditEntry): Promise<void>;
  listAudit(filter: { cafeId?: string; limit?: number }): Promise<AuditEntry[]>;
  grantReward(cafeId: string, customerId: string, reward: { kind: Reward["kind"]; name: string; valueCents: number; costCents: number }, now: Date, localDate: string): Promise<void>;
  /** Returns true the first time it's called for (cafe, job, period); false afterwards. */
  claimJob(cafeId: string, job: string, period: string): Promise<boolean>;

  // ---- phase 5: texts
  /** Reserves a text before sending. Returns null if this dedupeKey was already used. */
  claimSms(entry: SmsLogEntry): Promise<string | null>;
  finishSms(id: string, result: { status: SmsLogEntry["status"]; providerId?: string | null; error?: string | null }): Promise<void>;
  optOutPhoneEverywhere(phone: string): Promise<number>;

  // ---- squads
  createSquad(cafeId: string, name: string, code: string): Promise<Squad>;
  getSquad(cafeId: string, squadId: string): Promise<Squad | null>;
  getSquadByCode(cafeId: string, code: string): Promise<Squad | null>;
  listSquadMembers(cafeId: string, squadId: string): Promise<Customer[]>;
  setCustomerSquad(cafeId: string, customerId: string, squadId: string | null): Promise<void>;
  /** Marks this week complete once; returns the new squad streak, or null if already done. */
  completeSquadWeek(squadId: string, week: string): Promise<number | null>;

  // ---- web push
  savePushSubscription(cafeId: string, customerId: string, sub: PushSubscriptionRow): Promise<void>;
  listPushSubscriptions(cafeId: string, customerId: string): Promise<PushSubscriptionRow[]>;
  deletePushSubscription(endpoint: string): Promise<void>;

  // ---- Apple Wallet web service
  registerWalletDevice(deviceLibraryId: string, passTypeId: string, serial: string, pushToken: string): Promise<boolean>; // true = new
  unregisterWalletDevice(deviceLibraryId: string, passTypeId: string, serial: string): Promise<void>;
  listWalletSerials(deviceLibraryId: string, passTypeId: string): Promise<string[]>;
  listWalletPushTokens(serial: string): Promise<{ pushToken: string; passTypeId: string }[]>;

  // ---- phase 6: POS
  markVisitVerified(cafeId: string, visitId: string, posOrderId: string): Promise<void>;
}
