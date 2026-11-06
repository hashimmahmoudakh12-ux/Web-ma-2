import { z } from "zod";

/**
 * A café's loyalty "program": every rule the owner can change.
 *
 * Stored as one JSON column (`cafes.program`), so new options never need a
 * database migration. This schema checks the JSON and fills in defaults.
 *
 * Big picture (it's a game, not a punch card):
 *   check-ins earn XP -> XP climbs levels -> levels give rewards
 *   + streak flame & milestones, badges, drink passport, challenges,
 *     limited-time events, mystery dallahs, referrals and squads.
 */

const money = z.number().int().min(0); // cents
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const rewardSpecSchema = z.object({
  name: z.string().min(1), // what the customer sees: "Free pastry"
  valueCents: money, // menu price = what the customer saves
  costCents: money, // ingredient cost = what it costs the café (profit view)
});
export type RewardSpec = z.infer<typeof rewardSpecSchema>;

export const levelSchema = z.object({
  key: z.string().min(1), // stable id, e.g. "regular" (never shown)
  name: z.string().min(1), // shown name, e.g. "Qahwaji"
  minXp: z.number().int().min(0),
  icon: z.string().default("☕"),
  reward: rewardSpecSchema.optional(), // granted each time the level is reached
  perk: z.string().optional(), // ongoing perk at this level (e.g. secret menu)
});
export type Level = z.infer<typeof levelSchema>;

// ---- Badges --------------------------------------------------------------
export const badgeRuleSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("visit_before_hour"), hour: z.number().int().min(0).max(23) }),
  z.object({ type: z.literal("visit_after_hour"), hour: z.number().int().min(0).max(23) }),
  z.object({ type: z.literal("streak_weeks"), weeks: z.number().int().min(1) }),
  z.object({ type: z.literal("total_visits"), count: z.number().int().min(1) }),
  z.object({ type: z.literal("distinct_items"), count: z.number().int().min(1) }),
  z.object({ type: z.literal("category_complete"), categoryId: z.string() }),
  z.object({ type: z.literal("referrals"), count: z.number().int().min(1) }),
  z.object({ type: z.literal("event_visits"), eventId: z.string(), count: z.number().int().min(1) }),
  z.object({ type: z.literal("perfect_month") }),
  z.object({ type: z.literal("level_reached"), levelKey: z.string() }),
  z.object({ type: z.literal("squad_weeks"), weeks: z.number().int().min(1) }),
]);
export type BadgeRule = z.infer<typeof badgeRuleSchema>;

export const badgeSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(""),
  icon: z.string().default("🏅"),
  xp: z.number().int().min(0).default(50),
  rule: badgeRuleSchema,
  reward: rewardSpecSchema.optional(),
});
export type Badge = z.infer<typeof badgeSchema>;

// ---- Drink passport --------------------------------------------------------
export const menuCategorySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  icon: z.string().default("☕"),
  reward: rewardSpecSchema.optional(), // for collecting every stamp in the category
});
export const menuItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  categoryId: z.string(),
  icon: z.string().default("☕"),
});
export type MenuCategory = z.infer<typeof menuCategorySchema>;
export type MenuItem = z.infer<typeof menuItemSchema>;

// ---- Events & challenges ---------------------------------------------------
export const eventSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  icon: z.string().default("✨"),
  description: z.string().default(""),
  start: date,
  end: date,
  xpMultiplier: z.number().min(1).max(10).default(2),
  /** Optional daily time window (café time), e.g. after iftar 18 -> 24. */
  fromHour: z.number().int().min(0).max(23).optional(),
  toHour: z.number().int().min(1).max(24).optional(),
});
export type CafeEvent = z.infer<typeof eventSchema>;

export const challengeSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  icon: z.string().default("🎯"),
  /** weekly = resets every week; event = runs during an event; once = one time ever */
  period: z.enum(["weekly", "event", "once"]).default("weekly"),
  eventId: z.string().optional(),
  goal: z.discriminatedUnion("type", [
    z.object({ type: z.literal("visits"), count: z.number().int().min(1) }),
    z.object({ type: z.literal("try_category"), categoryId: z.string(), count: z.number().int().min(1).default(1) }),
    z.object({ type: z.literal("try_item"), itemId: z.string() }),
    z.object({ type: z.literal("try_new"), count: z.number().int().min(1).default(1) }),
  ]),
  xp: z.number().int().min(0).default(100),
  reward: rewardSpecSchema.optional(),
  active: z.boolean().default(true),
});
export type Challenge = z.infer<typeof challengeSchema>;

// ---- Mystery dallah --------------------------------------------------------
export const mysteryPrizeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  icon: z.string().default("🎁"),
  weight: z.number().min(0), // relative odds
  valueCents: money.default(0),
  costCents: money.default(0), // counts against the monthly budget
  xp: z.number().int().min(0).default(0), // XP-only prizes cost nothing
});
export type MysteryPrize = z.infer<typeof mysteryPrizeSchema>;

export const programSchema = z
  .object({
    levels: z.array(levelSchema).min(1),
    xp: z
      .object({
        perVisit: z.number().int().min(0).default(100),
        perStreakWeek: z.number().int().min(0).default(10),
        streakBonusCap: z.number().int().min(0).default(100),
        newItem: z.number().int().min(0).default(50),
      })
      .default({ perVisit: 100, perStreakWeek: 10, streakBonusCap: 100, newItem: 50 }),
    /** Visits needed in a week to keep the streak alive. */
    visitsPerWeek: z.number().int().min(1).default(1),
    weekStartsOn: z.union([z.literal(0), z.literal(1)]).default(1),
    cooldownMinutes: z.number().int().min(0).default(180),
    saversPerMonth: z.number().int().min(0).default(1),
    milestones: z
      .array(z.object({ weeks: z.number().int().min(1), xp: z.number().int().min(0), reward: rewardSpecSchema.optional() }))
      .default([]),
    welcomeReward: rewardSpecSchema.extend({ enabled: z.boolean(), onVisit: z.number().int().min(2).default(2) }).optional(),
    birthdayReward: rewardSpecSchema.extend({ enabled: z.boolean(), windowDays: z.number().int().min(0).default(7) }).optional(),
    badges: z.array(badgeSchema).default([]),
    menu: z.object({ categories: z.array(menuCategorySchema), items: z.array(menuItemSchema) }).default({ categories: [], items: [] }),
    events: z.array(eventSchema).default([]),
    challenges: z.array(challengeSchema).default([]),
    mystery: z
      .object({
        enabled: z.boolean(),
        everyNthVisit: z.number().int().min(0).default(5), // 0 = off
        chance: z.number().min(0).max(1).default(0), // extra random chance per visit
        monthlyBudgetCents: money.default(5000),
        prizes: z.array(mysteryPrizeSchema),
      })
      .default({ enabled: false, everyNthVisit: 5, chance: 0, monthlyBudgetCents: 5000, prizes: [] }),
    referral: z
      .object({ enabled: z.boolean(), xp: z.number().int().min(0), maxPerMonth: z.number().int().min(0) })
      .default({ enabled: true, xp: 200, maxPerMonth: 5 }),
    squads: z
      .object({ enabled: z.boolean(), maxMembers: z.number().int().min(2).max(10), xpPerWeek: z.number().int().min(0) })
      .default({ enabled: true, maxMembers: 4, xpPerWeek: 50 }),
    leaderboardPrize: z.string().optional(),
    leaderboardPrizeValueCents: money.default(0),
    leaderboardPrizeCostCents: money.default(0),
    averageTicketCents: money.default(700),
    smsRemindersEnabled: z.boolean().default(true),
  })
  .superRefine((p, ctx) => {
    if (p.levels[0].minXp !== 0) ctx.addIssue({ code: "custom", message: "The first level must start at 0 XP" });
    for (let i = 1; i < p.levels.length; i++) {
      if (p.levels[i].minXp <= p.levels[i - 1].minXp) ctx.addIssue({ code: "custom", message: "Each level needs more XP than the one before" });
    }
    const keys = new Set<string>();
    for (const b of p.badges) {
      if (keys.has(b.key)) ctx.addIssue({ code: "custom", message: `Two badges share the id "${b.key}"` });
      keys.add(b.key);
    }
  });

export type Program = z.infer<typeof programSchema>;

/**
 * Older saved programs (before XP) used `minVisits` on levels and a simple
 * "surprise reward". Convert them so nothing breaks after the upgrade.
 */
function upgradeLegacy(json: unknown): unknown {
  if (!json || typeof json !== "object") return json;
  const p = { ...(json as Record<string, unknown>) };
  const perVisit = (p.xp as { perVisit?: number } | undefined)?.perVisit ?? 100;
  if (Array.isArray(p.levels)) {
    p.levels = p.levels.map((l: Record<string, unknown>) =>
      l.minXp === undefined && typeof l.minVisits === "number" ? { ...l, minXp: l.minVisits * perVisit } : l,
    );
  }
  const s = p.surpriseReward as { enabled?: boolean; chance?: number; name?: string; valueCents?: number; costCents?: number } | undefined;
  if (s && !p.mystery) {
    p.mystery = {
      enabled: Boolean(s.enabled),
      everyNthVisit: 0,
      chance: s.chance ?? 0.05,
      monthlyBudgetCents: 5000,
      prizes: [
        { id: "legacy", name: s.name ?? "Surprise", icon: "🎁", weight: 1, valueCents: s.valueCents ?? 0, costCents: s.costCents ?? 0, xp: 0 },
      ],
    };
  }
  delete p.surpriseReward;
  return p;
}

export function parseProgram(json: unknown): Program {
  return programSchema.parse(upgradeLegacy(json));
}
