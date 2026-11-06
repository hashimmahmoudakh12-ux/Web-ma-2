"use server";
/**
 * SERVER ACTIONS for the counter tablet. These run on the server when the
 * tablet calls them. Every action re-checks that this device was unlocked
 * with the café's PIN (anyone can send requests to a server, so we never
 * trust the browser alone).
 */
import { cookies } from "next/headers";
import { z } from "zod";
import { COUNTER_COOKIE, makeCounterToken, verifyCounterToken, verifyPin } from "@/lib/counter-auth";
import { checkInByPhone, redeemReward, signUpAndCheckIn, type CheckInResult, type RedeemResult } from "@/lib/checkin/service";
import { getRepo, type Cafe } from "@/lib/data";
import { generateDemoData } from "@/lib/demo/generate";
import { normalizePhone } from "@/lib/phone";
import { resolveCafe } from "@/lib/tenant";

function cookieName(cafe: Cafe) {
  return `${COUNTER_COOKIE}_${cafe.slug}`;
}

/** Loads the café and makes sure this tablet is allowed to act for it. */
async function authorizedCafe(siteKey: string): Promise<Cafe> {
  const cafe = await resolveCafe(siteKey);
  if (!cafe) throw new Error("Unknown café");
  if (cafe.isDemo) return cafe; // demo café is open to everyone (data is fake and resettable)
  const token = (await cookies()).get(cookieName(cafe))?.value;
  if (!verifyCounterToken(token, cafe.id)) throw new Error("This tablet is locked. Enter the counter PIN.");
  return cafe;
}

export async function isCounterUnlocked(siteKey: string): Promise<boolean> {
  try {
    await authorizedCafe(siteKey);
    return true;
  } catch {
    return false;
  }
}

export async function unlockCounter(siteKey: string, pin: string): Promise<{ ok: boolean; message?: string }> {
  const cafe = await resolveCafe(siteKey);
  if (!cafe) return { ok: false, message: "Unknown café" };
  if (!verifyPin(pin, cafe.counterPinHash)) {
    await new Promise((r) => setTimeout(r, 1000)); // slow down guessing
    return { ok: false, message: "Wrong PIN" };
  }
  const { value, maxAge } = makeCounterToken(cafe.id);
  (await cookies()).set(cookieName(cafe), value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge,
    path: "/",
  });
  return { ok: true };
}

export async function lockCounter(siteKey: string) {
  const cafe = await resolveCafe(siteKey);
  if (cafe) (await cookies()).delete(cookieName(cafe));
}

export async function submitPhone(siteKey: string, rawPhone: string): Promise<CheckInResult> {
  const cafe = await authorizedCafe(siteKey);
  const phone = normalizePhone(rawPhone);
  if (!phone) return { status: "error", message: "That doesn't look like a valid phone number." };
  return checkInByPhone(cafe, phone);
}

const signUpSchema = z.object({
  phone: z.string(),
  firstName: z.string().trim().min(1, "Please enter a first name or nickname").max(24),
  birthdayMonth: z.number().int().min(1).max(12).nullable(),
  birthdayDay: z.number().int().min(1).max(31).nullable(),
  privacyAccepted: z.literal(true, { error: "Please accept the privacy notice to join" }),
  smsOptIn: z.boolean(),
  leaderboardOptIn: z.boolean(),
});

export async function submitSignUp(siteKey: string, input: z.input<typeof signUpSchema>): Promise<CheckInResult> {
  const cafe = await authorizedCafe(siteKey);
  const parsed = signUpSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0].message };
  const phone = normalizePhone(parsed.data.phone);
  if (!phone) return { status: "error", message: "That doesn't look like a valid phone number." };
  const { birthdayMonth, birthdayDay } = parsed.data;
  const hasBirthday = birthdayMonth !== null && birthdayDay !== null;
  return signUpAndCheckIn(cafe, {
    phone,
    firstName: parsed.data.firstName,
    birthdayMonth: hasBirthday ? birthdayMonth : null,
    birthdayDay: hasBirthday ? birthdayDay : null,
    smsOptIn: parsed.data.smsOptIn,
    leaderboardOptIn: parsed.data.leaderboardOptIn,
  });
}

export async function submitRedeem(siteKey: string, customerId: string, rewardId: string): Promise<RedeemResult> {
  const cafe = await authorizedCafe(siteKey);
  return redeemReward(cafe, customerId, rewardId);
}

export async function resetDemo(siteKey: string): Promise<{ ok: boolean }> {
  const cafe = await resolveCafe(siteKey);
  if (!cafe?.isDemo) return { ok: false };
  await getRepo().replaceDemoData(cafe.id, generateDemoData(cafe.program, cafe.timezone));
  return { ok: true };
}
