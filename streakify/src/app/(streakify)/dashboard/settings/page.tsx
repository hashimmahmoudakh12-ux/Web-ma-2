import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { SettingsForm } from "@/components/dashboard/SettingsForm";
import { AppShell } from "@/components/shell/AppShell";
import { requireOwnerCafe } from "@/lib/auth";
import { saveOwnerSettingsAction } from "../actions";

export const metadata: Metadata = { title: "Rewards & rules · Streakify", robots: { index: false } };

async function Inner({ searchParams }: PageProps<"/dashboard/settings">) {
  await connection();
  const q = await searchParams;
  const ctx = await requireOwnerCafe(typeof q.as === "string" ? q.as : null);
  const back = ctx.viewingAs ? `/dashboard?as=${ctx.cafe.id}` : "/dashboard";
  return (
    <AppShell who={`${ctx.session.user.email} · ${ctx.cafe.name}`}>
      <Link href={back} className="text-sm text-brand-muted">
        ‹ Back to dashboard
      </Link>
      <h1 className="text-2xl font-bold tracking-tight">Rewards & rules</h1>
      {ctx.viewingAs && <p className="rounded-xl bg-brand-primary/15 p-3 text-sm">You&apos;re viewing as the owner. Saving is disabled here; use the admin café settings instead.</p>}
      <SettingsForm program={ctx.cafe.program} brand={ctx.cafe.brand} mode="owner" save={saveOwnerSettingsAction} />
    </AppShell>
  );
}

export default function Page(props: PageProps<"/dashboard/settings">) {
  return (
    <Suspense fallback={<div className="min-h-dvh" />}>
      <Inner {...props} />
    </Suspense>
  );
}
