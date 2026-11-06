"use server";
/**
 * Customer app actions. The secret link token is the customer's "login":
 * every action looks the customer up by café + token first.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSquadFor, joinSquad, leaveSquad, markCelebrationsSeen, openMysteryBox } from "@/lib/checkin/service";
import { getRepo } from "@/lib/data";
import { smsConsentText } from "@/lib/privacy";
import { resolveCafe } from "@/lib/tenant";

async function me(siteKey: string, token: string) {
  const cafe = await resolveCafe(siteKey);
  if (!cafe) throw new Error("Unknown café");
  const customer = await getRepo().getCustomerByToken(cafe.id, token);
  if (!customer) throw new Error("Not found");
  return { cafe, customer };
}

const refresh = () => revalidatePath("/site/[site]/me/[token]", "page");

export async function updatePrefs(siteKey: string, token: string, prefs: { leaderboardOptIn?: boolean; smsOptIn?: boolean }) {
  const { cafe, customer } = await me(siteKey, token);
  await getRepo().updateCustomerPrefs(cafe.id, customer.id, {
    leaderboardOptIn: typeof prefs.leaderboardOptIn === "boolean" ? prefs.leaderboardOptIn : undefined,
    smsOptIn: typeof prefs.smsOptIn === "boolean" ? prefs.smsOptIn : undefined,
    smsConsentText: prefs.smsOptIn ? smsConsentText(cafe.name) : null,
  });
  refresh();
}

export async function openMysteryAction(siteKey: string, token: string, boxId: string) {
  const { cafe, customer } = await me(siteKey, token);
  return openMysteryBox(cafe, customer.id, String(boxId));
}

export async function markSeenAction(siteKey: string, token: string, upTo: string) {
  const { cafe, customer } = await me(siteKey, token);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(upTo)) return;
  await markCelebrationsSeen(cafe, customer.id, upTo);
}

export async function createSquadAction(siteKey: string, token: string, name: string) {
  const { cafe, customer } = await me(siteKey, token);
  if (!cafe.program.squads.enabled) return { ok: false as const, message: "Squads are off" };
  const r = await createSquadFor(cafe, customer.id, String(name ?? ""));
  refresh();
  return r;
}

export async function joinSquadAction(siteKey: string, token: string, code: string) {
  const { cafe, customer } = await me(siteKey, token);
  if (!cafe.program.squads.enabled) return { ok: false as const, message: "Squads are off" };
  const r = await joinSquad(cafe, customer.id, String(code ?? ""));
  refresh();
  return r;
}

export async function leaveSquadAction(siteKey: string, token: string) {
  const { cafe, customer } = await me(siteKey, token);
  await leaveSquad(cafe, customer.id);
  refresh();
}

const subSchema = z.object({ endpoint: z.url(), keys: z.object({ p256dh: z.string().min(10), auth: z.string().min(8) }) });

/** Saves this phone's push subscription (the customer just tapped "Allow"). */
export async function savePushAction(siteKey: string, token: string, sub: unknown) {
  const { cafe, customer } = await me(siteKey, token);
  const s = subSchema.parse(sub);
  await getRepo().savePushSubscription(cafe.id, customer.id, { endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth });
}

export async function deletePushAction(siteKey: string, token: string, endpoint: string) {
  await me(siteKey, token);
  await getRepo().deletePushSubscription(String(endpoint));
}
