/** Activity log: every sign-in and every change (who, what, when). */
import { connection } from "next/server";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { requireAdmin } from "@/lib/auth";
import { getRepo } from "@/lib/data";
import { ADMIN_NAV, AuditTable } from "../shared";

async function Inner() {
  await connection();
  const s = await requireAdmin();
  const repo = getRepo();
  const [rows, cafes] = await Promise.all([repo.listAudit({ limit: 200 }), repo.listCafes()]);
  return (
    <AppShell nav={ADMIN_NAV} who={s.user.email}>
      <h1 className="text-3xl font-bold tracking-tight">Activity log</h1>
      <p className="text-brand-muted">The latest 200 sign-ins and changes across Streakify.</p>
      <AuditTable rows={rows} cafeNames={new Map(cafes.map((c) => [c.id, c.name]))} />
    </AppShell>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-dvh" />}>
      <Inner />
    </Suspense>
  );
}
