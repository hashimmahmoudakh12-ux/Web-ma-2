/**
 * Keeps Wallet passes fresh. Called after every customer change; the work runs
 * AFTER the response is sent so the counter never waits for Apple or Google.
 */
import "server-only";
import { after } from "next/server";
import { getRepo, type Cafe, type Customer } from "../data";
import { appleWalletConfigured, pushApplePassUpdates } from "./apple";
import { googleWalletConfigured, updateGooglePass } from "./google";

export function refreshWalletPassesLater(cafe: Cafe, c: Customer) {
  if (!appleWalletConfigured() && !googleWalletConfigured()) return;
  const work = async () => {
    try {
      await Promise.all([
        appleWalletConfigured() ? getRepo().listWalletPushTokens(c.id).then(pushApplePassUpdates) : null,
        googleWalletConfigured() ? updateGooglePass(cafe, c) : null,
      ]);
    } catch (e) {
      console.warn("[wallet] refresh failed (the visit still counts):", e instanceof Error ? e.message : e);
    }
  };
  try {
    after(work);
  } catch {
    void work(); // outside a request (e.g. scripts)
  }
}

export { appleWalletConfigured } from "./apple";
export { googleWalletConfigured } from "./google";
