/** Two-factor login for your admin account (required with Supabase). */
import { connection } from "next/server";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { getAuth, requireAdmin } from "@/lib/auth";
import { MfaSetup } from "../AdminWidgets";
import { ADMIN_NAV } from "../shared";

async function Inner({ searchParams }: PageProps<"/admin/security">) {
  await connection();
  const s = await requireAdmin({ allowWithoutMfa: true });
  const setup = (await searchParams).setup === "1";
  const auth = getAuth();
  return (
    <AppShell nav={s.mfaEnrolled ? ADMIN_NAV : []} who={s.user.email}>
      <h1 className="text-3xl font-bold tracking-tight">Security</h1>
      <section className="card max-w-xl space-y-4 p-6">
        <h2 className="text-xl font-semibold">Two-factor login</h2>
        {!auth.supportsMfa ? (
          <p className="text-brand-muted">Two-factor login turns on once Supabase is connected (demo mode doesn&apos;t support it).</p>
        ) : s.mfaEnrolled ? (
          <p>
            <strong className="text-green-700 dark:text-green-300">On.</strong> Every admin sign-in asks for a code from your authenticator app.
          </p>
        ) : (
          <>
            {setup && <p className="rounded-xl bg-brand-primary/15 p-3 text-sm">Your admin account must use two-factor login before you can open the admin area.</p>}
            <MfaSetup />
          </>
        )}
      </section>
      <section className="card max-w-xl space-y-3 p-6">
        <h2 className="text-xl font-semibold">Password</h2>
        <a href="/auth/set-password" className="pressable inline-block rounded-xl bg-brand-text/10 px-4 py-2 font-semibold">
          Change my password
        </a>
      </section>
      <section className="card max-w-xl space-y-2 p-6 text-sm text-brand-muted">
        <h2 className="text-xl font-semibold text-brand-text">How access works</h2>
        <p>There is exactly one admin account (yours). Owners can only be created by you, from a café&apos;s Team section.</p>
        <p>Every sign-in, failed sign-in and change is recorded in the activity log.</p>
      </section>
    </AppShell>
  );
}

export default function Page(props: PageProps<"/admin/security">) {
  return (
    <Suspense fallback={<div className="min-h-dvh" />}>
      <Inner {...props} />
    </Suspense>
  );
}
