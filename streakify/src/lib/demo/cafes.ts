/**
 * The cafés that exist out of the box.
 *
 * - "sanaacafe": your first real client.
 * - "demo": a made-up café full of fake customers, for sales pitches.
 *
 * To add a new café you do NOT change code: use your admin page ("Add a
 * café"), which starts from `starterProgram` below. The seed script
 * (scripts/seed.ts) writes these two into Supabase.
 */
import type { Brand } from "../brand";
import type { Badge, Challenge, Program } from "../program";

export type CafeSeed = {
  slug: string;
  name: string;
  timezone: string;
  currency: string;
  isDemo: boolean;
  counterPin: string; // stored hashed
  ownerPassword: string; // stored hashed
  ownerEmail: string | null;
  brand: Brand;
  program: Program;
};

const milestones: Program["milestones"] = [
  { weeks: 4, xp: 100 },
  { weeks: 8, xp: 200, reward: { name: "Free pastry", valueCents: 450, costCents: 120 } },
  { weeks: 12, xp: 300, reward: { name: "Free drink", valueCents: 600, costCents: 150 } },
  { weeks: 26, xp: 500, reward: { name: "Free drink", valueCents: 600, costCents: 150 } },
  { weeks: 52, xp: 1000, reward: { name: "Bag of coffee beans", valueCents: 1800, costCents: 700 } },
];

function commonBadges(signatureCategoryId: string, signatureName: string, eventId: string | null): Badge[] {
  const b: Badge[] = [
    { key: "early-bird", name: "Early Bird", description: "Check in before 9am", icon: "🌅", xp: 50, rule: { type: "visit_before_hour", hour: 9 } },
    { key: "night-owl", name: "Night Owl", description: "Check in after 8pm", icon: "🦉", xp: 50, rule: { type: "visit_after_hour", hour: 20 } },
    { key: "on-fire", name: "On Fire", description: "4-week streak", icon: "🔥", xp: 0, rule: { type: "streak_weeks", weeks: 4 } },
    { key: "blazing", name: "Blazing", description: "8-week streak", icon: "☄️", xp: 0, rule: { type: "streak_weeks", weeks: 8 } },
    { key: "unstoppable", name: "Unstoppable", description: "12-week streak", icon: "💫", xp: 0, rule: { type: "streak_weeks", weeks: 12 } },
    { key: "half-year", name: "Half-Year Hero", description: "26-week streak", icon: "🏆", xp: 0, rule: { type: "streak_weeks", weeks: 26 } },
    { key: "year-of-qahwa", name: "Year of Coffee", description: "52-week streak", icon: "👑", xp: 0, rule: { type: "streak_weeks", weeks: 52 } },
    { key: "signature", name: `Tried every ${signatureName}`, description: `Collect every ${signatureName} stamp`, icon: "🗺️", xp: 150, rule: { type: "category_complete", categoryId: signatureCategoryId } },
    { key: "explorer", name: "Explorer", description: "Try 8 different menu items", icon: "🧭", xp: 100, rule: { type: "distinct_items", count: 8 } },
    { key: "friend", name: "Brought a Friend", description: "A friend joined with your code", icon: "🤝", xp: 50, rule: { type: "referrals", count: 1 } },
    { key: "perfect-month", name: "Perfect Month", description: "Hit your goal every week of a month", icon: "📅", xp: 150, rule: { type: "perfect_month" } },
    { key: "squad-goals", name: "Squad Goals", description: "Your squad completes 4 weeks together", icon: "👯", xp: 100, rule: { type: "squad_weeks", weeks: 4 } },
    { key: "regular-100", name: "Centurion", description: "100 visits", icon: "💯", xp: 300, rule: { type: "total_visits", count: 100 } },
  ];
  if (eventId) b.push({ key: "ramadan-regular", name: "Ramadan Regular", description: "5 visits during Ramadan", icon: "🌙", xp: 150, rule: { type: "event_visits", eventId, count: 5 } });
  return b;
}

function weeklyChallenges(refresherId: string): Challenge[] {
  return [
    { id: "three-visits", title: "Visit 3 times this week", icon: "🎯", period: "weekly", goal: { type: "visits", count: 3 }, xp: 150, active: true },
    { id: "try-refresher", title: "Try a refresher", icon: "🧊", period: "weekly", goal: { type: "try_category", categoryId: refresherId, count: 1 }, xp: 75, active: true },
    { id: "something-new", title: "Try something new", icon: "✨", period: "weekly", goal: { type: "try_new", count: 1 }, xp: 75, active: true },
  ];
}

const mysteryPrizes: Program["mystery"]["prizes"] = [
  { id: "xp150", name: "+150 bonus XP", icon: "⚡", weight: 40, valueCents: 0, costCents: 0, xp: 150 },
  { id: "xp300", name: "+300 bonus XP", icon: "🌟", weight: 8, valueCents: 0, costCents: 0, xp: 300 },
  { id: "cookie", name: "Free cookie", icon: "🍪", weight: 25, valueCents: 300, costCents: 60, xp: 0 },
  { id: "pastry", name: "Free pastry", icon: "🥐", weight: 15, valueCents: 450, costCents: 120, xp: 0 },
  { id: "drink", name: "Free drink", icon: "☕", weight: 10, valueCents: 600, costCents: 150, xp: 0 },
  { id: "beans", name: "Bag of coffee beans", icon: "🫘", weight: 2, valueCents: 1800, costCents: 700, xp: 0 },
];

const shared = {
  xp: { perVisit: 100, perStreakWeek: 10, streakBonusCap: 100, newItem: 50 },
  visitsPerWeek: 1,
  weekStartsOn: 1 as const,
  cooldownMinutes: 180,
  saversPerMonth: 1,
  milestones,
  welcomeReward: { enabled: true, onVisit: 2, name: "$1.50 off", valueCents: 150, costCents: 150 },
  birthdayReward: { enabled: true, windowDays: 7, name: "Free birthday drink", valueCents: 600, costCents: 150 },
  mystery: { enabled: true, everyNthVisit: 5, chance: 0.05, monthlyBudgetCents: 6000, prizes: mysteryPrizes },
  referral: { enabled: true, xp: 200, maxPerMonth: 5 },
  squads: { enabled: true, maxMembers: 4, xpPerWeek: 50 },
  leaderboardPrizeValueCents: 1800,
  leaderboardPrizeCostCents: 700,
  averageTicketCents: 750,
  smsRemindersEnabled: true,
};

export const sanaaCafe: CafeSeed = {
  slug: "sanaacafe",
  name: "Sana'a Cafe",
  // TODO: set to the café's real time zone (e.g. "America/Detroit") in the admin page.
  timezone: "America/New_York",
  currency: "USD",
  isDemo: false,
  counterPin: "2580",
  ownerPassword: "sanaa-owner",
  ownerEmail: null,
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
    ...shared,
    levels: [
      { key: "guest", name: "Guest", minXp: 0, icon: "🫖" },
      { key: "regular", name: "Regular", minXp: 400, icon: "☕", reward: { name: "Free pastry", valueCents: 450, costCents: 120 } },
      { key: "qahwaji", name: "Qahwaji", minXp: 1000, icon: "🫘", reward: { name: "Free drink", valueCents: 600, costCents: 150 } },
      { key: "sheikh", name: "Sheikh of the Dallah", minXp: 1800, icon: "🏺", reward: { name: "Free drink + pastry", valueCents: 1050, costCents: 270 } },
      { key: "legend", name: "Legend of Sana'a", minXp: 3000, icon: "👑", perk: "secret menu unlocked" },
    ],
    badges: commonBadges("yemeni", "Yemeni drink", "ramadan-2027"),
    menu: {
      categories: [
        { id: "yemeni", name: "Yemeni Specialties", icon: "🏺", reward: { name: "Free Yemeni drink", valueCents: 600, costCents: 150 } },
        { id: "espresso", name: "Espresso Bar", icon: "☕" },
        { id: "refreshers", name: "Refreshers", icon: "🧊" },
        { id: "sweets", name: "Sweets", icon: "🍯" },
      ],
      items: [
        { id: "adeni-chai", name: "Adeni Chai", categoryId: "yemeni", icon: "🫖" },
        { id: "qishr", name: "Qishr", categoryId: "yemeni", icon: "🌿" },
        { id: "jubani", name: "Jubani Coffee", categoryId: "yemeni", icon: "🫘" },
        { id: "mofawar", name: "Mofawar", categoryId: "yemeni", icon: "🏺" },
        { id: "hawaij-latte", name: "Hawaij Latte", categoryId: "yemeni", icon: "🥛" },
        { id: "espresso", name: "Espresso", categoryId: "espresso", icon: "☕" },
        { id: "cortado", name: "Cortado", categoryId: "espresso", icon: "🥃" },
        { id: "latte", name: "Latte", categoryId: "espresso", icon: "🥛" },
        { id: "mango", name: "Mango Refresher", categoryId: "refreshers", icon: "🥭" },
        { id: "hibiscus", name: "Hibiscus Refresher", categoryId: "refreshers", icon: "🌺" },
        { id: "rose-lemonade", name: "Rose Lemonade", categoryId: "refreshers", icon: "🌹" },
        { id: "bint-al-sahn", name: "Bint Al Sahn", categoryId: "sweets", icon: "🍯" },
        { id: "date-cookie", name: "Date Cookie", categoryId: "sweets", icon: "🍪" },
      ],
    },
    // Dates are approximate. Check the moon-sighting dates each year and edit them in owner settings.
    events: [
      { id: "ramadan-2027", name: "Ramadan Nights", icon: "🌙", description: "After-iftar visits earn double XP", start: "2027-02-08", end: "2027-03-09", xpMultiplier: 2, fromHour: 18, toHour: 24 },
      { id: "eid-2027", name: "Eid Mubarak", icon: "🎉", description: "Double XP all day for Eid", start: "2027-03-10", end: "2027-03-12", xpMultiplier: 2 },
      { id: "summer-2027", name: "Summer of Refreshers", icon: "☀️", description: "1.5× XP all summer", start: "2027-06-21", end: "2027-08-31", xpMultiplier: 1.5 },
    ],
    challenges: [
      ...weeklyChallenges("refreshers"),
      { id: "ramadan-five", title: "Visit 5 nights during Ramadan", icon: "🌙", period: "event", eventId: "ramadan-2027", goal: { type: "visits", count: 5 }, xp: 300, reward: { name: "Free Adeni Chai", valueCents: 500, costCents: 120 }, active: true },
    ],
    leaderboardPrize: "A free bag of Yemeni coffee beans",
  },
};

/** What a brand-new café starts with (admin page → Add a café). */
export const starterProgram: Program = {
  ...shared,
  levels: [
    { key: "guest", name: "Guest", minXp: 0, icon: "🫖" },
    { key: "regular", name: "Regular", minXp: 400, icon: "☕", reward: { name: "Free pastry", valueCents: 450, costCents: 120 } },
    { key: "barista-friend", name: "Barista's Friend", minXp: 1000, icon: "🤝", reward: { name: "Free drink", valueCents: 600, costCents: 150 } },
    { key: "captain", name: "Coffee Captain", minXp: 1800, icon: "⚓", reward: { name: "Free drink + pastry", valueCents: 1050, costCents: 270 } },
    { key: "legend", name: "House Legend", minXp: 3000, icon: "👑", perk: "secret menu unlocked" },
  ],
  badges: commonBadges("signature", "signature drink", null),
  menu: {
    categories: [
      { id: "signature", name: "Signature Drinks", icon: "⭐", reward: { name: "Free signature drink", valueCents: 650, costCents: 160 } },
      { id: "espresso", name: "Espresso Bar", icon: "☕" },
      { id: "refreshers", name: "Refreshers", icon: "🧊" },
      { id: "bakery", name: "Bakery", icon: "🥐" },
    ],
    items: [
      { id: "honey-latte", name: "Honey Lavender Latte", categoryId: "signature", icon: "🍯" },
      { id: "maple-cold-brew", name: "Maple Cold Brew", categoryId: "signature", icon: "🍁" },
      { id: "cardamom-cortado", name: "Cardamom Cortado", categoryId: "signature", icon: "🌿" },
      { id: "espresso", name: "Espresso", categoryId: "espresso", icon: "☕" },
      { id: "cappuccino", name: "Cappuccino", categoryId: "espresso", icon: "☁️" },
      { id: "latte", name: "Latte", categoryId: "espresso", icon: "🥛" },
      { id: "berry", name: "Berry Refresher", categoryId: "refreshers", icon: "🫐" },
      { id: "peach-tea", name: "Peach Iced Tea", categoryId: "refreshers", icon: "🍑" },
      { id: "croissant", name: "Croissant", categoryId: "bakery", icon: "🥐" },
      { id: "muffin", name: "Blueberry Muffin", categoryId: "bakery", icon: "🧁" },
    ],
  },
  events: [],
  challenges: weeklyChallenges("refreshers"),
  leaderboardPrize: "Free drinks for a week",
};

export const demoCafe: CafeSeed = {
  slug: "demo",
  name: "Harbor Bean Coffee",
  timezone: "America/New_York",
  currency: "USD",
  isDemo: true,
  counterPin: "0000",
  ownerPassword: "demo",
  ownerEmail: null,
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
    ...starterProgram,
    // An event that is always running in the demo, so pitches can show double XP.
    events: [{ id: "demo-festival", name: "Harvest Festival", icon: "🍂", description: "Double XP during the festival", start: "2026-01-01", end: "2030-12-31", xpMultiplier: 2, fromHour: 0, toHour: 24 }],
    challenges: [
      ...starterProgram.challenges,
      { id: "festival-four", title: "Visit 4 times during the festival", icon: "🍂", period: "event", eventId: "demo-festival", goal: { type: "visits", count: 4 }, xp: 200, active: true },
    ],
  },
};

export const seedCafes = [sanaaCafe, demoCafe];
