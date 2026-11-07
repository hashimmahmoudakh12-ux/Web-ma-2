/**
 * SYSTEM CHECK: open /api/health to see which settings are in place.
 * Shows only yes/no, never any secret values. Handy after deploying.
 */
import { connection } from "next/server";
import { sessionSecretConfigured } from "@/lib/secrets";
import { getAuth } from "@/lib/auth";
import { getRepo } from "@/lib/data";
import { pushConfigured } from "@/lib/push";
import { twilioConfigured } from "@/lib/sms";
import { appleWalletConfigured, googleWalletConfigured } from "@/lib/wallet";

export async function GET() {
  await connection();
  const checks: Record<string, unknown> = {};
  try {
    const repo = getRepo();
    const cafes = await repo.listCafes();
    checks.database = repo.kind === "supabase" ? "supabase (real database)" : "in-memory demo data (resets on restart; add SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY for real use)";
    checks.cafes = cafes.map((c) => c.slug);
  } catch (e) {
    checks.database = `ERROR: ${e instanceof Error ? e.message : String(e)}`;
  }
  const yes = (b: boolean, fix: string) => (b ? "ok" : `missing: ${fix}`);
  checks.sessionSecret = yes(sessionSecretConfigured(), "set SESSION_SECRET (32+ characters) or logins reset when the server restarts");
  checks.logins = getAuth().kind === "supabase" ? "supabase (real accounts + 2FA)" : "demo accounts (set NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY + SUPABASE_SERVICE_ROLE_KEY for real logins)";
  if (getAuth().kind === "local") checks.adminPassword = yes(Boolean(process.env.ADMIN_PASSWORD), "set ADMIN_PASSWORD (demo admin login) to use /admin");
  checks.cronSecret = yes(Boolean(process.env.CRON_SECRET), "set CRON_SECRET so the daily job can run");
  checks.rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "(not set: use /c/<cafe>/... links)";
  checks.optional = {
    email: Boolean(process.env.RESEND_API_KEY && process.env.REPORT_FROM_EMAIL),
    texts: twilioConfigured(),
    push: pushConfigured(),
    appleWallet: appleWalletConfigured(),
    googleWallet: googleWalletConfigured(),
    toast: Boolean(process.env.TOAST_CLIENT_ID),
  };
  return Response.json(checks, { headers: { "Cache-Control": "no-store" } });
}
