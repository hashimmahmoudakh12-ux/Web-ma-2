/**
 * DEMO LOGINS (used only when Supabase isn't connected).
 *
 * Same screens and rules as the real thing, but accounts live in memory and
 * reset when the server restarts. Not for real cafés: 2FA and database-level
 * security need Supabase.
 *
 * Starting accounts:
 *   admin: ADMIN_EMAIL (default admin@streakify.local) + ADMIN_PASSWORD
 *          (default "admin" on your computer; must be set in production)
 *   owners of the seed cafés: see `localOwnerLogin` in lib/demo/cafes.ts
 */
import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { getRepo } from "../data";
import { seedCafes } from "../demo/cafes";
import { hashSecret, makeToken, verifySecret, verifyToken } from "../secrets";
import type { AuthBackend, AuthUser, Session, SignInResult } from "./types";

type Account = AuthUser & { passwordHash: string | null };
type Store = { accounts: Map<string, Account>; links: Map<string, { userId: string; expires: number }>; seeded: boolean };

const g = globalThis as unknown as { __streakifyAccounts?: Store };
const store = (): Store => (g.__streakifyAccounts ??= { accounts: new Map(), links: new Map(), seeded: false });

const COOKIE = "streakify_user";

async function ensureSeeded() {
  const s = store();
  if (s.seeded) return;
  s.seeded = true;
  const adminPassword = process.env.ADMIN_PASSWORD ?? (process.env.NODE_ENV === "production" ? null : "admin");
  const admin: Account = {
    id: randomUUID(),
    email: (process.env.ADMIN_EMAIL ?? "admin@streakify.local").toLowerCase(),
    name: "Streakify admin",
    role: "admin",
    cafeId: null,
    title: "Admin",
    passwordHash: adminPassword ? hashSecret(adminPassword) : null,
  };
  s.accounts.set(admin.id, admin);
  for (const seed of seedCafes) {
    const cafe = await getRepo().getCafeBySlug(seed.slug);
    if (!cafe) continue;
    const id = randomUUID();
    s.accounts.set(id, { id, email: seed.localOwnerLogin.email, name: null, role: "owner", cafeId: cafe.id, title: "Owner", passwordHash: hashSecret(seed.localOwnerLogin.password) });
  }
}

const strip = ({ passwordHash: _p, ...u }: Account): AuthUser => (void _p, u);

async function setUserCookie(userId: string) {
  const { value, maxAge } = makeToken(`user:${userId}`, 7);
  (await cookies()).set(COOKIE, value, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge, path: "/" });
}

export class LocalAuth implements AuthBackend {
  readonly kind = "local" as const;
  readonly supportsMfa = false;

  private async find(email: string) {
    await ensureSeeded();
    const e = email.trim().toLowerCase();
    return [...store().accounts.values()].find((a) => a.email === e) ?? null;
  }

  async signIn(email: string, password: string): Promise<SignInResult> {
    const acc = await this.find(email);
    if (!acc || !verifySecret(password, acc.passwordHash)) return { ok: false, message: "Wrong email or password." };
    await setUserCookie(acc.id);
    return { ok: true, user: strip(acc), next: "done" };
  }

  async verifyMfa() {
    return false;
  }

  async signOut() {
    (await cookies()).delete(COOKIE);
  }

  async session(): Promise<Session | null> {
    await ensureSeeded();
    const token = (await cookies()).get(COOKIE)?.value;
    if (!token) return null;
    for (const acc of store().accounts.values()) {
      if (verifyToken(token, `user:${acc.id}`)) return { user: strip(acc), aal: "aal1", mfaEnrolled: false };
    }
    return null;
  }

  async enrollMfa(): Promise<{ factorId: string; qr: string; secret: string }> {
    throw new Error("Two-factor login needs Supabase. Connect Supabase to turn it on.");
  }

  async confirmMfaEnroll() {
    return false;
  }

  async setPassword(newPassword: string) {
    const s = await this.session();
    if (!s) return { ok: false, message: "Your link has expired. Ask for a new one." };
    const acc = store().accounts.get(s.user.id)!;
    acc.passwordHash = hashSecret(newPassword);
    return { ok: true };
  }

  async confirmLink(params: URLSearchParams) {
    const token = params.get("local");
    const link = token ? store().links.get(token) : undefined;
    if (!token || !link || link.expires < Date.now()) return false;
    store().links.delete(token);
    await setUserCookie(link.userId);
    return true;
  }

  async scopedRepo() {
    // No database-level security in demo mode: the app checks the café instead.
    return getRepo();
  }

  private makeLink(userId: string, origin: string) {
    const token = randomBytes(24).toString("hex");
    store().links.set(token, { userId, expires: Date.now() + 7 * 86_400_000 });
    return `${origin}/auth/confirm?local=${token}`;
  }

  async inviteOwner(input: { email: string; name: string | null; cafeId: string; title: string }, origin: string) {
    if (await this.find(input.email)) throw new Error("That email already has an account.");
    const id = randomUUID();
    store().accounts.set(id, { id, email: input.email.toLowerCase(), name: input.name, role: "owner", cafeId: input.cafeId, title: input.title, passwordHash: null });
    return { userId: id, link: this.makeLink(id, origin) };
  }

  async resetLink(email: string, origin: string) {
    const acc = await this.find(email);
    return acc ? this.makeLink(acc.id, origin) : null;
  }

  async changeEmail(userId: string, email: string) {
    if (await this.find(email)) throw new Error("That email already has an account.");
    const acc = store().accounts.get(userId);
    if (acc) acc.email = email.toLowerCase();
  }

  async removeUser(userId: string) {
    store().accounts.delete(userId);
  }

  async listMembers(cafeId: string) {
    await ensureSeeded();
    return [...store().accounts.values()].filter((a) => a.cafeId === cafeId).map(strip);
  }

  async getUser(userId: string) {
    await ensureSeeded();
    const a = store().accounts.get(userId);
    return a ? strip(a) : null;
  }

  async findByEmail(email: string) {
    const a = await this.find(email);
    return a ? strip(a) : null;
  }
}
