/**
 * OWNER DASHBOARD: streakify.com/dashboard — the owner's café only.
 * You (admin) can open it for any café with ?as=<cafeId> ("view as owner").
 */
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { DeleteCustomer } from "@/components/dashboard/DeleteCustomer";
import { OwnerDashboard } from "@/components/dashboard/OwnerDashboard";
import { AppShell } from "@/components/shell/AppShell";
import { requireOwnerCafe } from "@/lib/auth";
import { publicCafeUrl } from "@/lib/urls";
import { deleteCustomerAction } from "./actions";

export const metadata: Metadata = { title: "Dashboard · Streakify", robots: { index: false } };

async function Inner({ searchParams }: PageProps<"/dashboard">) {
  await connection();
  const q = await searchParams;
  const as = typeof q.as === "string" ? q.as : null;
  const ctx = await requireOwnerCafe(as);
  const keep = (extra: Record<string, string>) => `?${new URLSearchParams({ ...(ctx.viewingAs ? { as: ctx.cafe.id } : {}), ...extra })}`;
  const banner = ctx.viewingAs ? (
    <div className="bg-brand-primary px-4 py-2 text-center text-sm font-semibold text-brand-on-primary">
      Viewing as the owner of {ctx.cafe.name} (read-only) ·{" "}
      <Link href={`/admin/cafes/${ctx.cafe.id}`} className="underline">
        Back to admin
      </Link>
    </div>
  ) : null;
  return (
    <AppShell who={ctx.viewingAs ? `Admin viewing ${ctx.cafe.name}` : `${ctx.session.user.email} · ${ctx.cafe.name}`} banner={banner} nav={[{ href: `/dashboard${keep({})}`, label: "Dashboard" }, { href: `/dashboard/settings${keep({})}`, label: "Rewards & rules" }]}>
      <OwnerDashboard
        cafe={ctx.cafe}
        repo={ctx.repo}
        monthParam={q.month}
        hrefFor={keep}
        actions={
          <>
            <Link href={`/dashboard/settings${keep({})}`} className="pressable rounded-lg bg-brand-surface px-3 py-2">
              Edit rewards & rules
            </Link>
            <a href={publicCafeUrl(ctx.cafe, "/counter")} className="pressable rounded-lg bg-brand-surface px-3 py-2">
              Counter screen
            </a>
          </>
        }
        footer={ctx.viewingAs ? null : <DeleteCustomer onDelete={deleteCustomerAction} />}
      />
    </AppShell>
  );
}

export default function DashboardPage(props: PageProps<"/dashboard">) {
  return (
    <Suspense fallback={<div className="min-h-dvh" />}>
      <Inner {...props} />
    </Suspense>
  );
}
