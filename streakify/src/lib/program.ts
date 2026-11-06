import { z } from "zod";

/**
 * A café's loyalty "program": every rule the owner can change.
 *
 * It is stored as one JSON column (`cafes.program`) in the database, so adding
 * a new option later never needs a database migration. This schema checks the
 * JSON and fills in sensible defaults for anything missing.
 */

const money = z.number().int().min(0); // cents

export const rewardSpecSchema = z.object({
  name: z.string().min(1), // what the customer sees: "Free pastry"
  valueCents: money, // menu price = what the customer saves
  costCents: money, // ingredient cost = what it costs the café (profit view)
});
export type RewardSpec = z.infer<typeof rewardSpecSchema>;

export const levelSchema = z.object({
  key: z.string().min(1), // stable id, e.g. "silver" (never shown)
  name: z.string().min(1), // shown name, e.g. "Silver"
  minVisits: z.number().int().min(0), // streak visits needed to reach it
  reward: rewardSpecSchema.optional(), // granted each time the level is reached
  perk: z.string().optional(), // ongoing perk while at this level (e.g. secret menu)
});
export type Level = z.infer<typeof levelSchema>;

export const programSchema = z
  .object({
    levels: z.array(levelSchema).min(1),
    /** Visits needed in a week to keep the streak alive. */
    visitsPerWeek: z.number().int().min(1).default(1),
    /** 1 = weeks start Monday, 0 = Sunday. */
    weekStartsOn: z.union([z.literal(0), z.literal(1)]).default(1),
    /** Anti-cheat: minimum minutes between two check-ins for one phone. */
    cooldownMinutes: z.number().int().min(0).default(180),
    /** Streak savers each customer gets per calendar month. */
    saversPerMonth: z.number().int().min(0).default(1),
    welcomeReward: rewardSpecSchema
      .extend({ enabled: z.boolean(), onVisit: z.number().int().min(2).default(2) })
      .optional(),
    surpriseReward: rewardSpecSchema
      .extend({
        enabled: z.boolean(),
        /** Chance per check-in, 0..1. 0.05 = roughly 1 in 20 visits. */
        chance: z.number().min(0).max(1),
      })
      .optional(),
    birthdayReward: rewardSpecSchema
      .extend({
        enabled: z.boolean(),
        /** Days after the birthday the reward can still be picked up. */
        windowDays: z.number().int().min(0).default(7),
      })
      .optional(),
    /** Prize for #1 on the monthly leaderboard. */
    leaderboardPrize: z.string().optional(),
    leaderboardPrizeValueCents: money.default(0),
    leaderboardPrizeCostCents: money.default(0),
    /** Average order size. Used to estimate extra revenue from repeat visits. */
    averageTicketCents: money.default(700),
    /** Send "your streak ends tomorrow" texts (only to people who opted in). */
    smsRemindersEnabled: z.boolean().default(true),
  })
  .superRefine((p, ctx) => {
    if (p.levels[0].minVisits !== 0) {
      ctx.addIssue({ code: "custom", message: "The first level must start at 0 visits" });
    }
    for (let i = 1; i < p.levels.length; i++) {
      if (p.levels[i].minVisits <= p.levels[i - 1].minVisits) {
        ctx.addIssue({ code: "custom", message: "Levels must need more visits as they go up" });
      }
    }
  });

export type Program = z.infer<typeof programSchema>;

export function parseProgram(json: unknown): Program {
  return programSchema.parse(json);
}
