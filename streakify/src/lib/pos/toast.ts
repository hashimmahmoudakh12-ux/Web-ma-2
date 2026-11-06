/**
 * Toast POS — skeleton for phase 6.
 *
 * Toast's Standard API flow we'll use:
 *  1. Auth: POST {apiHost}/authentication/v1/authentication/login with the
 *     client id/secret Toast gives you -> access token (cache until expiry).
 *  2. Orders: GET {apiHost}/orders/v2/ordersBulk?startDate=..&endDate=..
 *     with header "Toast-Restaurant-External-ID: <restaurant GUID>".
 *  3. Match: an order paid within N minutes of the check-in; for rewards,
 *     look for an applied discount whose GUID = the "Streak Reward" discount.
 *
 * Credentials will live in environment variables (never in the database
 * in plain text); per-café IDs live in `cafes.pos_config`.
 */
import type { PosProvider } from "./types";

export type ToastConfig = {
  restaurantGuid: string;
  streakRewardDiscountGuid: string;
  apiHost?: string; // defaults to Toast's production host
};

export function createToastProvider(config: ToastConfig): PosProvider {
  void config;
  return {
    name: "toast",
    async verifyRecentPurchase() {
      throw new Error("Toast integration is planned for phase 6");
    },
    async verifyRewardDiscount() {
      throw new Error("Toast integration is planned for phase 6");
    },
  };
}
