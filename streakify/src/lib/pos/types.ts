/**
 * POS (point-of-sale) connection — READY FOR PHASE 6, NOT USED YET.
 *
 * Today a check-in is "trust the tablet". Later, a POS provider (Toast) can
 * confirm a real purchase happened, and confirm a reward discount was used.
 * Each café picks its provider in `cafes.pos_provider`; new POS systems
 * (Square, Clover...) just add another file implementing this interface.
 */
export type PurchaseCheck = {
  verified: boolean;
  orderId?: string;
  totalCents?: number;
  reason?: string;
};

export interface PosProvider {
  readonly name: "none" | "toast";
  /** Was there a paid order at this café around `at` (optionally matching the phone)? */
  verifyRecentPurchase(input: { at: Date; phone?: string; withinMinutes: number }): Promise<PurchaseCheck>;
  /** Was the "Streak Reward" discount applied to an order around `at`? */
  verifyRewardDiscount(input: { at: Date; amountCents: number; withinMinutes: number }): Promise<PurchaseCheck>;
}
