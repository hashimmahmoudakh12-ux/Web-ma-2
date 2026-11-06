"use server";
/** Customer page settings. The secret link token is the customer's "login". */
import { revalidatePath } from "next/cache";
import { getRepo } from "@/lib/data";
import { smsConsentText } from "@/lib/privacy";
import { resolveCafe } from "@/lib/tenant";

export async function updatePrefs(siteKey: string, token: string, prefs: { leaderboardOptIn?: boolean; smsOptIn?: boolean }) {
  const cafe = await resolveCafe(siteKey);
  if (!cafe) throw new Error("Unknown café");
  const repo = getRepo();
  const customer = await repo.getCustomerByToken(cafe.id, token);
  if (!customer) throw new Error("Not found");
  await repo.updateCustomerPrefs(cafe.id, customer.id, {
    leaderboardOptIn: typeof prefs.leaderboardOptIn === "boolean" ? prefs.leaderboardOptIn : undefined,
    smsOptIn: typeof prefs.smsOptIn === "boolean" ? prefs.smsOptIn : undefined,
    smsConsentText: prefs.smsOptIn ? smsConsentText(cafe.name) : null,
  });
  revalidatePath("/site/[site]/me/[token]", "page");
}
