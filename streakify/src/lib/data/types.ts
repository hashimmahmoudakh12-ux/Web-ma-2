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
  posProvider: "none" | "toast";
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
  version: number;
};

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
  now: Date;
};

export type CheckInWrite = {
  cafeId: string;
  customerId: string;
  expectedVersion: number;
  state: StreakState;
  visit: {
    createdAt: string;
    localDate: string;
    weekStart: string;
    source: "counter" | "toast" | "demo";
    streakVisitsAfter: number;
    levelAfter: string;
  };
  rewards: { kind: string; levelKey?: string; name: string; valueCents: number; costCents: number }[];
  events: StreakEvent[];
};

/** Bulk data used to (re)fill the demo café. */
export type DemoDataset = {
  customers: (NewCustomer & { state: StreakState; createdAt: string })[];
  visits: { customerIndex: number; createdAt: string; localDate: string; weekStart: string; streakVisitsAfter: number; levelAfter: string }[];
  rewards: {
    customerIndex: number;
    kind: string;
    levelKey?: string;
    name: string;
    valueCents: number;
    costCents: number;
    earnedAt: string;
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
  applyCheckIn(write: CheckInWrite): Promise<{ visitId: string }>;

  listAvailableRewards(cafeId: string, customerId: string): Promise<Reward[]>;
  /** Marks a reward redeemed. Returns null if it was already used / not found. */
  redeemReward(cafeId: string, customerId: string, rewardId: string, now: Date, localDate: string): Promise<Reward | null>;
  savings(cafeId: string, customerId: string, localDate: string): Promise<{ totalCents: number; todayCents: number }>;

  /** Wipes the demo café's customers and loads a fresh dataset. Demo cafés only. */
  replaceDemoData(cafeId: string, data: DemoDataset): Promise<void>;
}
