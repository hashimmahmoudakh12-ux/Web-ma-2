/**
 * Toast POS connection (phase 6).
 *
 * WHAT IT DOES: after a check-in, looks in Toast for a paid order around the
 * same time. If it finds one, the visit is marked "verified" (shown on the
 * owner dashboard). It never blocks a check-in: if Toast is slow or down,
 * the visit still counts, it just isn't marked verified.
 *
 * SETUP (when Toast approves API access):
 *   1. Toast gives you a client ID + secret ("Standard API access").
 *      Put them in Vercel env vars TOAST_CLIENT_ID and TOAST_CLIENT_SECRET.
 *   2. For each café set, in the `cafes` table:
 *        pos_provider = 'toast'
 *        pos_config   = {"restaurantGuid": "...", "streakRewardDiscountGuid": "..."}
 *
 * Endpoints used (Toast Standard API):
 *   POST /authentication/v1/authentication/login   -> access token
 *   GET  /orders/v2/ordersBulk?startDate&endDate    -> orders in a time window
 *
 * NOTE: written against Toast's published docs but not yet tested with a
 * live Toast account. Test in Toast's sandbox before turning it on.
 */
import type { PosProvider, PurchaseCheck } from "./types";

export type ToastConfig = {
  restaurantGuid: string;
  streakRewardDiscountGuid?: string;
};

const API_HOST = process.env.TOAST_API_HOST ?? "https://ws-api.toasttab.com";

let cachedToken: { value: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const clientId = process.env.TOAST_CLIENT_ID;
  const clientSecret = process.env.TOAST_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("TOAST_CLIENT_ID / TOAST_CLIENT_SECRET are not set");
  const res = await fetch(`${API_HOST}/authentication/v1/authentication/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId, clientSecret, userAccessType: "TOAST_MACHINE_CLIENT" }),
  });
  if (!res.ok) throw new Error(`Toast login failed (${res.status})`);
  const json = (await res.json()) as { token?: { accessToken?: string; expiresIn?: number } };
  const value = json.token?.accessToken;
  if (!value) throw new Error("Toast login returned no token");
  cachedToken = { value, expiresAt: Date.now() + (json.token?.expiresIn ?? 3600) * 1000 };
  return value;
}

type ToastCheck = {
  totalAmount?: number;
  paymentStatus?: string;
  customer?: { phone?: string } | null;
  appliedDiscounts?: { discount?: { guid?: string } | null; discountAmount?: number }[];
};
type ToastOrder = { guid: string; paidDate?: string | null; closedDate?: string | null; voided?: boolean; checks?: ToastCheck[] };

/** Toast wants times like 2026-11-06T12:00:00.000+0000 */
const toastTime = (d: Date) => d.toISOString().replace("Z", "+0000");

async function ordersAround(config: ToastConfig, at: Date, withinMinutes: number): Promise<ToastOrder[]> {
  const start = new Date(at.getTime() - withinMinutes * 60_000);
  const end = new Date(at.getTime() + 5 * 60_000);
  const url = `${API_HOST}/orders/v2/ordersBulk?startDate=${encodeURIComponent(toastTime(start))}&endDate=${encodeURIComponent(toastTime(end))}&pageSize=100`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${await accessToken()}`, "Toast-Restaurant-External-ID": config.restaurantGuid },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Toast orders request failed (${res.status})`);
  return ((await res.json()) as ToastOrder[]).filter((o) => !o.voided);
}

const digits = (s?: string) => (s ?? "").replace(/\D/g, "").slice(-10);

export function createToastProvider(config: ToastConfig): PosProvider {
  return {
    name: "toast",

    async verifyRecentPurchase({ at, phone, withinMinutes }): Promise<PurchaseCheck> {
      const orders = await ordersAround(config, at, withinMinutes);
      const paid = orders.filter((o) => o.paidDate || o.checks?.some((c) => c.paymentStatus === "PAID" || c.paymentStatus === "CLOSED"));
      if (!paid.length) return { verified: false, reason: "No paid order near check-in time" };
      // Prefer an order whose check has the same phone number; otherwise the closest paid order.
      const byPhone = phone ? paid.find((o) => o.checks?.some((c) => digits(c.customer?.phone) === digits(phone))) : undefined;
      const order = byPhone ?? paid[paid.length - 1];
      const total = order.checks?.reduce((sum, c) => sum + (c.totalAmount ?? 0), 0) ?? 0;
      return { verified: true, orderId: order.guid, totalCents: Math.round(total * 100), reason: byPhone ? "phone match" : "time match" };
    },

    async verifyRewardDiscount({ at, amountCents, withinMinutes }): Promise<PurchaseCheck> {
      if (!config.streakRewardDiscountGuid) return { verified: false, reason: "streakRewardDiscountGuid not configured" };
      const orders = await ordersAround(config, at, withinMinutes);
      for (const o of orders) {
        for (const c of o.checks ?? []) {
          const hit = c.appliedDiscounts?.find(
            (d) => d.discount?.guid === config.streakRewardDiscountGuid && Math.abs(Math.round((d.discountAmount ?? 0) * 100) - amountCents) <= 1,
          );
          if (hit) return { verified: true, orderId: o.guid };
        }
      }
      return { verified: false, reason: "No matching Streak Reward discount found" };
    },
  };
}
