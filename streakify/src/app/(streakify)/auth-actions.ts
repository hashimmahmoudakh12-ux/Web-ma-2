"use server";
/** Sign-in, two-factor, forgot-password and sign-out actions. */
import { redirect } from "next/navigation";
import { z } from "zod";
import { audit, currentSession, getAuth, homeFor } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { throttle } from "@/lib/secrets";
import { clientKey } from "@/lib/session";
import { currentOrigin } from "@/lib/urls";

export type SignInState = { step: "password" | "mfa" | "done"; message?: string; to?: string };

export async function signInAction(email: string, password: string): Promise<SignInState> {
  const e = z.email().safeParse(email.trim());
  if (!e.success || !password) return { step: "password", message: "Enter your email and password." };
  const key = `login:${await clientKey()}:${e.data.toLowerCase()}`;
  const r = await getAuth().signIn(e.data, password);
  const allowed = await throttle(key, r.ok);
  if (!r.ok) {
    await audit("login.failed", { session: null, actorEmail: e.data, details: { reason: r.message, lockedOut: !allowed } });
    return { step: "password", message: r.message };
  }
  if (!allowed) {
    await getAuth().signOut(); // locked out: don't keep the session
    await audit("login.blocked", { session: null, actorEmail: e.data, details: { reason: "too many attempts" } });
    return { step: "password", message: "Too many attempts. Try again in 5 minutes." };
  }
  if (r.next === "mfa") return { step: "mfa" };
  await audit("login.success", { session: { user: r.user, aal: "aal1", mfaEnrolled: false }, cafeId: r.user.cafeId });
  if (r.next === "enroll-mfa") return { step: "done", to: "/admin/security?setup=1" };
  return { step: "done", to: r.user.role === "admin" ? "/admin" : "/dashboard" };
}

export async function verifyMfaAction(code: string): Promise<SignInState> {
  const s = await currentSession();
  if (!s) return { step: "password", message: "Please sign in again." };
  const ok = /^\d{6}$/.test(code) && (await getAuth().verifyMfa(code));
  if (!(await throttle(`mfa:${s.user.id}`, ok))) return { step: "mfa", message: ok ? "Too many attempts. Wait 5 minutes." : "That code didn't work." };
  if (!ok) {
    await audit("login.mfa_failed", { session: s });
    return { step: "mfa", message: "That code didn't work. Use the current 6-digit code from your authenticator app." };
  }
  await audit("login.success", { session: { ...s, aal: "aal2" }, details: { mfa: true } });
  return { step: "done", to: homeFor(s) };
}

/** Always answers the same way, so nobody can find out which emails have accounts. */
export async function forgotPasswordAction(email: string): Promise<{ message: string }> {
  const generic = { message: "If that email has an account, we've sent a link to reset your password. Check your inbox." };
  const e = z.email().safeParse(email.trim());
  if (!e.success) return { message: "Enter a valid email." };
  if (!(await throttle(`forgot:${await clientKey()}`, false))) return generic;
  const user = await getAuth().findByEmail(e.data);
  if (!user) return generic;
  const link = await getAuth().resetLink(e.data, await currentOrigin());
  if (link) {
    const sent = await sendEmail(
      e.data,
      "Reset your Streakify password",
      `<p>Hi${user.name ? ` ${user.name}` : ""},</p><p>Use this link to set a new password (it works once):</p><p><a href="${link}">Set a new password</a></p><p>If you didn't ask for this, ignore this email.</p><p style="color:#888">Streakify</p>`,
    );
    if (!sent.sent) console.warn(`[auth] password reset email not sent (${sent.reason}). Link for ${e.data}: ${link}`);
  }
  await audit("password.reset_requested", { session: null, actorEmail: e.data, cafeId: user.cafeId });
  return generic;
}

export async function setPasswordAction(password: string, confirm: string): Promise<{ ok: boolean; message?: string }> {
  if (password.length < 10) return { ok: false, message: "Use at least 10 characters." };
  if (password !== confirm) return { ok: false, message: "The two passwords don't match." };
  const s = await currentSession();
  if (!s) return { ok: false, message: "Your link has expired. Ask for a new one." };
  const r = await getAuth().setPassword(password);
  if (!r.ok) return r;
  await audit("password.set", { session: s, cafeId: s.user.cafeId });
  return { ok: true };
}

export async function signOutAction() {
  const s = await currentSession();
  if (s) await audit("logout", { session: s, cafeId: s.user.cafeId });
  await getAuth().signOut();
  redirect("/login");
}
