/**
 * Simple, secure logins without user accounts.
 *
 * Three kinds of access, each proven by a signed cookie:
 *  - "counter:<cafeId>"  a tablet unlocked with the café's PIN (90 days)
 *  - "owner:<cafeId>"    the café owner, after typing their password (30 days)
 *  - "admin"             you, after typing ADMIN_PASSWORD (7 days)
 *
 * Secrets (PINs, passwords) are stored as salted scrypt hashes, never as text.
 * Cookies are signed with SESSION_SECRET so nobody can forge them.
 */
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/** Fallback when SESSION_SECRET is missing in production: random per server, so cookies can't be forged. */
const ephemeral = randomBytes(32).toString("hex");

export function sessionSecretConfigured() {
  return (process.env.SESSION_SECRET ?? "").length >= 32;
}

export function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 32) return s;
  if (process.env.NODE_ENV === "production") {
    // Still secure, but logins won't survive a server restart. /api/health flags this.
    return ephemeral;
  }
  return "dev-only-secret-do-not-use-in-production-0000";
}

/** "salt:hash" */
export function hashSecret(value: string): string {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(value, salt, 32).toString("hex")}`;
}

export function verifySecret(value: string, stored: string | null): boolean {
  if (!stored) return false;
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(value, salt, 32);
  const expected = Buffer.from(hash, "hex");
  return expected.length === candidate.length && timingSafeEqual(candidate, expected);
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function makeToken(scope: string, days: number, now = new Date()) {
  const expires = now.getTime() + days * 86_400_000;
  const payload = `${Buffer.from(scope).toString("base64url")}.${expires}`;
  return { value: `${payload}.${sign(payload)}`, maxAge: days * 86_400 };
}

export function verifyToken(token: string | undefined, scope: string, now = new Date()): boolean {
  if (!token) return false;
  const [scopeB64, expires, sig] = token.split(".");
  if (!scopeB64 || !expires || !sig) return false;
  if (Buffer.from(scopeB64, "base64url").toString() !== scope) return false;
  if (Number(expires) < now.getTime()) return false;
  const expected = Buffer.from(sign(`${scopeB64}.${expires}`));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Constant-time compare for the admin password (kept in an env variable). */
export function checkAdminPassword(input: string): boolean {
  const real = process.env.ADMIN_PASSWORD ?? (process.env.NODE_ENV === "production" ? "" : "admin");
  if (!real) return false;
  const a = Buffer.from(createHmac("sha256", "cmp").update(input).digest());
  const b = Buffer.from(createHmac("sha256", "cmp").update(real).digest());
  return timingSafeEqual(a, b);
}

/** Small in-memory brake on password guessing (per server instance). */
const failures = new Map<string, { count: number; until: number }>();
export async function throttle(key: string, ok: boolean): Promise<boolean> {
  const now = Date.now();
  const f = failures.get(key);
  if (f && f.until > now) return false; // locked out for a bit
  if (ok) {
    failures.delete(key);
    return true;
  }
  const count = (f?.count ?? 0) + 1;
  failures.set(key, { count, until: count >= 5 ? now + 5 * 60_000 : 0 });
  await new Promise((r) => setTimeout(r, 800));
  return false;
}
