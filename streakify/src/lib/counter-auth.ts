/**
 * Locks the counter tablet to one café.
 *
 * Without this, anyone could open the check-in page at home and give
 * themselves visits. Staff type the café's PIN once on the tablet; we then
 * store a signed cookie (valid 90 days) that proves "this device is the
 * counter of café X". Every check-in action verifies that cookie.
 */
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const COOKIE_DAYS = 90;
export const COUNTER_COOKIE = "streakify_counter";

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 32) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be set (at least 32 characters) in production");
  }
  return "dev-only-secret-do-not-use-in-production-0000";
}

/** "salt:hash" — PINs are never stored in plain text. */
export function hashPin(pin: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pin, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPin(pin: string, stored: string | null): boolean {
  if (!stored) return false;
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(pin, salt, 32);
  const expected = Buffer.from(hash, "hex");
  return expected.length === candidate.length && timingSafeEqual(candidate, expected);
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function makeCounterToken(cafeId: string, now = new Date()) {
  const expires = now.getTime() + COOKIE_DAYS * 86_400_000;
  const payload = `${cafeId}.${expires}`;
  return { value: `${payload}.${sign(payload)}`, maxAge: COOKIE_DAYS * 86_400 };
}

export function verifyCounterToken(token: string | undefined, cafeId: string, now = new Date()): boolean {
  if (!token) return false;
  const [id, expires, sig] = token.split(".");
  if (!id || !expires || !sig || id !== cafeId) return false;
  if (Number(expires) < now.getTime()) return false;
  const expected = Buffer.from(sign(`${id}.${expires}`));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
