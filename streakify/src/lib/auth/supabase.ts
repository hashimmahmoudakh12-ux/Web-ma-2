/**
 * REAL LOGINS with Supabase Auth.
 *
 * - Passwords, sessions, invite/reset tokens and 2FA are handled by Supabase.
 * - Our `profiles` table says who is the admin and which café each owner runs.
 * - Owners' data queries use THEIR login token, so the database's Row Level
 *   Security only ever returns their own café's rows.
 * - Admin-only operations use the service-role key, on the server only.
 */
import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { SupabaseRepo } from "../data/supabase-repo";
import type { AuthBackend, AuthUser, Session, SignInResult } from "./types";

export function supabaseAuthEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && anon && service ? { url, anon, service } : null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const toUser = (p: any): AuthUser => ({ id: p.id, email: p.email, name: p.full_name ?? null, role: p.role, cafeId: p.cafe_id ?? null, title: p.title ?? "Owner" });

export class SupabaseAuth implements AuthBackend {
  readonly kind = "supabase" as const;
  readonly supportsMfa = true;
  private admin: SupabaseClient;

  constructor(private env: { url: string; anon: string; service: string }) {
    this.admin = createClient(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  /** Client that reads/writes the login cookies of the current request. */
  private async client(): Promise<SupabaseClient> {
    const store = await cookies();
    return createServerClient(this.env.url, this.env.anon, {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list) => {
          try {
            list.forEach(({ name, value, options }) => store.set(name, value, options));
          } catch {
            // Called from a Server Component: the proxy refreshes cookies instead.
          }
        },
      },
    });
  }

  private async profile(userId: string): Promise<AuthUser | null> {
    const { data } = await this.admin.from("profiles").select("*").eq("id", userId).maybeSingle();
    return data ? toUser(data) : null;
  }

  private async hasVerifiedTotp(sb: SupabaseClient) {
    const { data } = await sb.auth.mfa.listFactors();
    return (data?.totp ?? []).some((f) => f.status === "verified");
  }

  async signIn(email: string, password: string): Promise<SignInResult> {
    const sb = await this.client();
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error || !data.user) return { ok: false, message: "Wrong email or password." };
    const user = await this.profile(data.user.id);
    if (!user) {
      // Valid Supabase account but no Streakify role: no access at all.
      await sb.auth.signOut();
      return { ok: false, message: "This account doesn't have access. Contact Streakify." };
    }
    if (user.role === "admin") return { ok: true, user, next: (await this.hasVerifiedTotp(sb)) ? "mfa" : "enroll-mfa" };
    return { ok: true, user, next: "done" };
  }

  async verifyMfa(code: string) {
    const sb = await this.client();
    const { data } = await sb.auth.mfa.listFactors();
    const factor = (data?.totp ?? []).find((f) => f.status === "verified");
    if (!factor) return false;
    const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
    return !error;
  }

  async signOut() {
    await (await this.client()).auth.signOut();
  }

  async session(): Promise<Session | null> {
    const sb = await this.client();
    const { data } = await sb.auth.getUser(); // verifies the token with Supabase
    if (!data.user) return null;
    const user = await this.profile(data.user.id);
    if (!user) return null;
    const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    return { user, aal: aal?.currentLevel === "aal2" ? "aal2" : "aal1", mfaEnrolled: await this.hasVerifiedTotp(sb) };
  }

  async enrollMfa() {
    const sb = await this.client();
    const { data: list } = await sb.auth.mfa.listFactors();
    for (const f of list?.all ?? []) if (f.status !== "verified") await sb.auth.mfa.unenroll({ factorId: f.id });
    const { data, error } = await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: `Streakify ${Date.now()}` });
    if (error || !data) throw new Error(error?.message ?? "Could not start 2FA setup");
    return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
  }

  async confirmMfaEnroll(factorId: string, code: string) {
    const { error } = await (await this.client()).auth.mfa.challengeAndVerify({ factorId, code });
    return !error;
  }

  async setPassword(newPassword: string) {
    const { error } = await (await this.client()).auth.updateUser({ password: newPassword });
    return error ? { ok: false, message: error.message } : { ok: true };
  }

  async confirmLink(params: URLSearchParams) {
    const sb = await this.client();
    const tokenHash = params.get("token_hash");
    const type = params.get("type") as "invite" | "recovery" | "magiclink" | "email" | null;
    if (tokenHash && type) return !(await sb.auth.verifyOtp({ token_hash: tokenHash, type })).error;
    const code = params.get("code");
    if (code) return !(await sb.auth.exchangeCodeForSession(code)).error;
    return false;
  }

  async scopedRepo() {
    return new SupabaseRepo(await this.client());
  }

  async inviteOwner(input: { email: string; name: string | null; cafeId: string; title: string }, origin: string) {
    const { data, error } = await this.admin.auth.admin.generateLink({ type: "invite", email: input.email, options: { data: { full_name: input.name } } });
    if (error || !data.user) throw new Error(error?.message.includes("already") ? "That email already has an account." : (error?.message ?? "Could not invite"));
    const { error: pErr } = await this.admin.from("profiles").insert({ id: data.user.id, email: input.email, full_name: input.name, role: "owner", cafe_id: input.cafeId, title: input.title });
    if (pErr) {
      await this.admin.auth.admin.deleteUser(data.user.id);
      throw new Error(pErr.message);
    }
    return { userId: data.user.id, link: `${origin}/auth/confirm?token_hash=${data.properties.hashed_token}&type=invite` };
  }

  async resetLink(email: string, origin: string) {
    const { data, error } = await this.admin.auth.admin.generateLink({ type: "recovery", email });
    if (error || !data.properties) return null;
    return `${origin}/auth/confirm?token_hash=${data.properties.hashed_token}&type=recovery`;
  }

  async changeEmail(userId: string, email: string) {
    const { error } = await this.admin.auth.admin.updateUserById(userId, { email, email_confirm: true });
    if (error) throw new Error(error.message);
    await this.admin.from("profiles").update({ email }).eq("id", userId);
  }

  async removeUser(userId: string) {
    const { error } = await this.admin.auth.admin.deleteUser(userId); // profile row cascades
    if (error) throw new Error(error.message);
  }

  async listMembers(cafeId: string) {
    const { data } = await this.admin.from("profiles").select("*").eq("cafe_id", cafeId).order("created_at");
    return (data ?? []).map(toUser);
  }

  async getUser(userId: string) {
    return this.profile(userId);
  }

  async findByEmail(email: string) {
    const { data } = await this.admin.from("profiles").select("*").ilike("email", email).maybeSingle();
    return data ? toUser(data) : null;
  }
}
