/**
 * THE GATEKEEPER. Every protected page and action calls one of these:
 *
 *   requireAdmin()        you only (role admin + 2FA passed). Owners -> /dashboard.
 *   requireOwnerCafe(as)  an owner's own café. You can pass ?as=<cafeId> to
 *                         "view as owner". Everyone else -> /login.
 *   audit(action, ...)    writes who-did-what-when to the audit log.
 *
 * These checks run on the SERVER for every request, so hiding a button is never
 * the only protection. For owners, the database (Row Level Security) is a
 * second wall behind this one.
 */
import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getRepo, type Cafe, type Repo } from "../data";
import { LocalAuth } from "./local";
import { SupabaseAuth, supabaseAuthEnv } from "./supabase";
import type { AuthBackend, Session } from "./types";

export type { AuthUser, Session } from "./types";

let backend: AuthBackend | null = null;

export function getAuth(): AuthBackend {
  if (backend) return backend;
  const env = supabaseAuthEnv();
  backend = env ? new SupabaseAuth(env) : new LocalAuth();
  return backend;
}

export async function currentSession(): Promise<Session | null> {
  try {
    return await getAuth().session();
  } catch {
    return null;
  }
}

/** Where a signed-in user belongs. */
export function homeFor(s: Session): string {
  return s.user.role === "admin" ? "/admin" : "/dashboard";
}

/** Admin only, with 2FA. Redirects everyone else. */
export async function requireAdmin(opts: { allowWithoutMfa?: boolean } = {}): Promise<Session> {
  const s = await currentSession();
  if (!s) redirect("/login");
  if (s.user.role !== "admin") redirect("/dashboard");
  if (getAuth().supportsMfa && !opts.allowWithoutMfa) {
    if (!s.mfaEnrolled) redirect("/admin/security?setup=1");
    if (s.aal !== "aal2") redirect("/login?step=mfa");
  }
  return s;
}

export type OwnerContext = { session: Session; cafe: Cafe; repo: Repo; viewingAs: boolean };

/**
 * An owner's café (or, for the admin, any café via "view as owner").
 * `repo` is limited by Row Level Security for owners.
 */
export async function requireOwnerCafe(asCafeId?: string | null): Promise<OwnerContext> {
  const s = await currentSession();
  if (!s) redirect("/login");
  if (s.user.role === "admin") {
    await requireAdmin();
    const cafe = asCafeId ? await getRepo().getCafeById(asCafeId) : null;
    if (!cafe) redirect("/admin");
    return { session: s, cafe, repo: getRepo(), viewingAs: true };
  }
  if (!s.user.cafeId) redirect("/login");
  // The café comes from the owner's profile, never from the URL.
  const cafe = await getRepo().getCafeById(s.user.cafeId);
  if (!cafe) redirect("/login");
  return { session: s, cafe, repo: await getAuth().scopedRepo(), viewingAs: false };
}

/** Records who did what, when (and from where). Never throws. */
export async function audit(action: string, opts: { cafeId?: string | null; details?: Record<string, unknown>; session?: Session | null; actorEmail?: string } = {}) {
  try {
    const s = opts.session === undefined ? await currentSession() : opts.session;
    const ip = (await headers()).get("x-forwarded-for")?.split(",")[0].trim() ?? null;
    await getRepo().audit({
      actorId: s?.user.id ?? null,
      actorEmail: s?.user.email ?? opts.actorEmail ?? null,
      actorRole: s?.user.role ?? null,
      action,
      cafeId: opts.cafeId ?? null,
      details: opts.details ?? {},
      ip,
    });
  } catch (e) {
    console.error("[audit] failed", e);
  }
}
