/**
 * The cafés that exist out of the box.
 *
 * - "sanaacafe": your first real client.
 * - "demo": a made-up café full of fake customers, for sales pitches.
 *
 * To add a new café later you do NOT change code: you add a row to the
 * `cafes` table (copy one of these as a starting point). The seed script
 * (scripts/seed.ts) writes these into Supabase.
 */
import type { Brand } from "../brand";
import type { Program } from "../program";

export type CafeSeed = {
  slug: string;
  name: string;
  timezone: string;
  currency: string;
  isDemo: boolean;
  counterPin: string; // only used by the seed script, stored hashed
  brand: Brand;
  program: Program;
};

export const sanaaCafe: CafeSeed = {
  slug: "sanaacafe",
  name: "Sana'a Cafe",
  // TODO: set to the café's real time zone (e.g. "America/Detroit", "America/New_York").
  timezone: "America/New_York",
  currency: "USD",
  isDemo: false,
  counterPin: "2580", // change this after setup!
  brand: {
    logoUrl: "/cafes/sanaacafe/logo.png",
    colors: {
      background: "#16100b",
      surface: "#231a12",
      primary: "#d4a24c",
      onPrimary: "#16100b",
      text: "#f5ead8",
      muted: "#b3a089",
    },
    tagline: "Yemeni coffee, rewarded.",
  },
  program: {
    visitsPerWeek: 1,
    weekStartsOn: 1,
    cooldownMinutes: 180,
    saversPerMonth: 1,
    levels: [
      { key: "bronze", name: "Bronze", minVisits: 0 },
      {
        key: "silver",
        name: "Silver",
        minVisits: 4,
        reward: { name: "Free pastry", valueCents: 450, costCents: 120 },
      },
      {
        key: "gold",
        name: "Gold",
        minVisits: 8,
        reward: { name: "Free drink", valueCents: 600, costCents: 150 },
      },
      {
        key: "mokha",
        name: "Mokha Legend",
        minVisits: 15,
        perk: "secret menu unlocked",
      },
    ],
    welcomeReward: { enabled: true, onVisit: 2, name: "$1.50 off", valueCents: 150, costCents: 150 },
    surpriseReward: { enabled: true, chance: 0.05, name: "Free cookie", valueCents: 300, costCents: 60 },
    birthdayReward: { enabled: true, windowDays: 7, name: "Free birthday drink", valueCents: 600, costCents: 150 },
    leaderboardPrize: "A free bag of Yemeni coffee beans",
  },
};

export const demoCafe: CafeSeed = {
  slug: "demo",
  name: "Harbor Bean Coffee",
  timezone: "America/New_York",
  currency: "USD",
  isDemo: true,
  counterPin: "0000",
  brand: {
    logoUrl: null,
    colors: {
      background: "#0f1c24",
      surface: "#17303c",
      primary: "#4fd1c5",
      onPrimary: "#0f1c24",
      text: "#eaf6f6",
      muted: "#9cc0c4",
    },
    tagline: "Demo café — try any phone number",
  },
  program: {
    ...sanaaCafe.program,
    levels: sanaaCafe.program.levels.map((l) => (l.key === "mokha" ? { ...l, key: "legend", name: "Legend" } : l)),
    leaderboardPrize: "Free drinks for a week",
  },
};

export const seedCafes = [sanaaCafe, demoCafe];
