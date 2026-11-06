"use server";
/**
 * SERVER ACTIONS for the counter tablet. These run on the server when the
 * tablet calls them. Every action re-checks that this device was unlocked
 * with the café's PIN (anyone can send requests to a server, so we never
 * trust the browser alone).
 */
import QRCode from "qrcode";
import { z } from "zod";
import { throttle, verifySecret } from "@/lib/auth";
import { checkInByPhone, redeemReward, signUpAndCheckIn, type CheckInResult, type RedeemResult } from "@/lib/checkin/service";
import { getRepo, type Cafe } from "@/lib/data";
import { generateDemoData } from "@/lib/demo/generate";
import { demoCafe } from "@/lib/demo/cafes";
import { parseBrand } from "@/lib/brand";
import { parseProgram } from "@/lib/program";
import { normalizePhone } from "@/lib/phone";
import { clientKey, grantCafeAccess, hasCafeAccess, revokeCafeAccess } from "@/lib/session";
import { resolveCafe } from "@/lib/tenant";
import { absoluteCafeUrl } from "@/lib/urls";

/** Loads the café and makes sure this tablet is allowed to act for it. */
async function authorizedCafe(siteKey: string): Promise<Cafe> {
  const cafe = await resolveCafe(siteKey);
  if (!cafe) throw new Error("Unknown café");
  if (cafe.isDemo) return cafe; // demo café is open to everyone (data is fake and resettable)
  if (!(await hasCafeAccess("counter", cafe))) throw new Error("This tablet is locked. Enter the counter PIN.");
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
  const ok = verifySecret(pin, cafe.counterPinHash);
  if (!(await throttle(`pin:${cafe.id}:${await clientKey()}`, ok))) {
    return { ok: false, message: ok ? "Too many tries. Wait 5 minutes." : "Wrong PIN" };
  }
  await grantCafeAccess("counter", cafe);
  return { ok: true };
}

export async function lockCounter(siteKey: string) {
  const cafe = await resolveCafe(siteKey);
  if (cafe) await revokeCafeAccess("counter", cafe);
}

export async function submitPhone(siteKey: string, rawPhone: string): Promise<CheckInResult> {
  const cafe = await authorizedCafe(siteKey);
  const phone = normalizePhone(rawPhone);
  if (!phone) return { status: "error", message: "That doesn't look like a valid phone number." };
  return withLink(await checkInByPhone(cafe, phone));
}

/** Adds the customer's personal page link + QR code to a successful result. */
async function withLink(result: CheckInResult): Promise<CheckInResult> {
  if (result.status !== "ok") return result;
  const url = await absoluteCafeUrl(`/me/${result.view.publicToken}`);
  const qrSvg = await QRCode.toString(url, { type: "svg", margin: 1, color: { dark: "#000000", light: "#ffffff" } });
  return { ...result, view: { ...result.view, personalUrl: url, qrSvg } };
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
  return withLink(await signUpAndCheckIn(cafe, {
    phone,
    firstName: parsed.data.firstName,
    birthdayMonth: hasBirthday ? birthdayMonth : null,
    birthdayDay: hasBirthday ? birthdayDay : null,
    smsOptIn: parsed.data.smsOptIn,
    leaderboardOptIn: parsed.data.leaderboardOptIn,
  }));
}

export async function submitRedeem(siteKey: string, customerId: string, rewardId: string): Promise<RedeemResult> {
  const cafe = await authorizedCafe(siteKey);
  return redeemReward(cafe, customerId, rewardId);
}

export async function resetDemo(siteKey: string): Promise<{ ok: boolean }> {
  const cafe = await resolveCafe(siteKey);
  if (!cafe?.isDemo) return { ok: false };
  const fresh = demoCafe.program;
  await getRepo().updateCafe(cafe.id, { program: parseProgram(fresh), brand: parseBrand(demoCafe.brand), name: demoCafe.name });
  await getRepo().replaceDemoData(cafe.id, generateDemoData(parseProgram(fresh), cafe.timezone));
  return { ok: true };
}
