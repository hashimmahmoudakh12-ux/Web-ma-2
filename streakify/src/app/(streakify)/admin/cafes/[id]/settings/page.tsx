/** Full café settings for you: rewards + the admin-only parts (logo, colors, menu). */
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { SettingsForm } from "@/components/dashboard/SettingsForm";
import { AppShell } from "@/components/shell/AppShell";
import { requireAdmin } from "@/lib/auth";
import { getRepo } from "@/lib/data";
import { saveFullSettingsAction } from "../../../actions";
import { ADMIN_NAV } from "../../../shared";

async function Inner({ params }: PageProps<"/admin/cafes/[id]/settings">) {
  await connection();
  const s = await requireAdmin();
  const { id } = await params;
  const cafe = await getRepo().getCafeById(id);
  if (!cafe) notFound();
  return (
    <AppShell nav={ADMIN_NAV} who={s.user.email}>
      <Link href={`/admin/cafes/${cafe.id}`} className="text-sm text-brand-muted">
        ‹ {cafe.name}
      </Link>
      <h1 className="text-2xl font-bold tracking-tight">{cafe.name}: logo, colors, menu & rewards</h1>
      <SettingsForm program={cafe.program} brand={cafe.brand} mode="admin" save={saveFullSettingsAction.bind(null, cafe.id)} />
    </AppShell>
  );
}

export default function Page(props: PageProps<"/admin/cafes/[id]/settings">) {
  return (
    <Suspense fallback={<div className="min-h-dvh" />}>
      <Inner {...props} />
    </Suspense>
  );
}
