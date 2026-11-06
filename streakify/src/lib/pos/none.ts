import type { PosProvider } from "./types";

/** No POS connected: every check-in is accepted as-is (current behaviour). */
export const noPos: PosProvider = {
  name: "none",
  async verifyRecentPurchase() {
    return { verified: false, reason: "No POS connected" };
  },
  async verifyRewardDiscount() {
    return { verified: false, reason: "No POS connected" };
  },
};
