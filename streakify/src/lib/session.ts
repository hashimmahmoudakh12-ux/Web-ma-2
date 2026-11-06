/**
 * Cookie helpers for the three logins (see auth.ts). Server-only.
 */
import "server-only";
import { cookies, headers } from "next/headers";
import { makeToken, verifyToken } from "./auth";
import type { Cafe } from "./data";

type Kind = "counter" | "owner";
const DAYS: Record<Kind | "admin", number> = { counter: 90, owner: 30, admin: 7 };

const cookieName = (kind: Kind, cafe: Cafe) => `streakify_${kind}_${cafe.slug}`;

async function setCookie(name: string, scope: string, days: number) {
  const { value, maxAge } = makeToken(scope, days);
  (await cookies()).set(name, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge,
    path: "/",
  });
}

export async function grantCafeAccess(kind: Kind, cafe: Cafe) {
  await setCookie(cookieName(kind, cafe), `${kind}:${cafe.id}`, DAYS[kind]);
}

export async function hasCafeAccess(kind: Kind, cafe: Cafe): Promise<boolean> {
  const token = (await cookies()).get(cookieName(kind, cafe))?.value;
  return verifyToken(token, `${kind}:${cafe.id}`);
}

export async function revokeCafeAccess(kind: Kind, cafe: Cafe) {
  (await cookies()).delete(cookieName(kind, cafe));
}

export async function grantAdmin() {
  await setCookie("streakify_admin", "admin", DAYS.admin);
}
export async function isAdmin(): Promise<boolean> {
  return verifyToken((await cookies()).get("streakify_admin")?.value, "admin");
}
export async function revokeAdmin() {
  (await cookies()).delete("streakify_admin");
}

/** Who is asking (for login throttling). */
export async function clientKey(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
}
