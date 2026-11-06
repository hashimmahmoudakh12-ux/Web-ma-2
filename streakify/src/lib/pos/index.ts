/**
 * Picks the POS connection for a café and verifies visits in the background.
 */
import "server-only";
import { after } from "next/server";
import { getRepo, type Cafe } from "../data";
import { noPos } from "./none";
import { createToastProvider, type ToastConfig } from "./toast";
import type { PosProvider } from "./types";

export function posFor(cafe: Cafe): PosProvider {
  if (cafe.posProvider === "toast") {
    const cfg = cafe.posConfig as Partial<ToastConfig>;
    if (cfg.restaurantGuid) return createToastProvider(cfg as ToastConfig);
  }
  return noPos;
}

/**
 * Runs AFTER the response is sent, so the customer never waits for Toast.
 * Waits a few minutes' window back from the check-in for a paid order.
 */
export function verifyVisitInBackground(cafe: Cafe, visitId: string, at: Date, phone: string) {
  const pos = posFor(cafe);
  if (pos.name === "none") return;
  after(async () => {
    try {
      const check = await pos.verifyRecentPurchase({ at, phone, withinMinutes: 20 });
      if (check.verified && check.orderId) await getRepo().markVisitVerified(cafe.id, visitId, check.orderId);
    } catch (e) {
      console.error(`[toast] could not verify visit ${visitId}:`, e);
    }
  });
}
