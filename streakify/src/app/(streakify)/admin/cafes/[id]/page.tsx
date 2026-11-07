/**
 * One café, for you: what the owner sees + admin-only controls
 * (status, plan, team, PIN, demo, export, reports, delete).
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { OwnerDashboard } from "@/components/dashboard/OwnerDashboard";
import { AppShell } from "@/components/shell/AppShell";
import { getAuth, requireAdmin } from "@/lib/auth";
import { getRepo } from "@/lib/data";
import { formatMonth, localDate, previousMonth } from "@/lib/time";
import { publicCafeUrl } from "@/lib/urls";
import { CafeAdminForm, DeleteCafe, DemoToggle, EmailReportButton, PinForm, StatusButtons, TeamPanel } from "../../AdminWidgets";
import { ADMIN_NAV, AuditTable, StatusChip } from "../../shared";

function Panel({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="card space-y-4 p-6">
      <h2 className="text-xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}

async function Inner({ params, searchParams }: PageProps<"/admin/cafes/[id]">) {
  await connection();
  const s = await requireAdmin();
  const { id } = await params;
  const q = await searchParams;
  const repo = getRepo();
  const cafe = await repo.getCafeById(id);
  if (!cafe) notFound();
  const [members, audit] = await Promise.all([getAuth().listMembers(cafe.id), repo.listAudit({ cafeId: cafe.id, limit: 30 })]);
  const month = localDate(new Date(), cafe.timezone).slice(0, 7);
  const last = previousMonth(month);
  const tab = q.tab === "owner" ? "owner" : "admin";

  return (
    <AppShell nav={ADMIN_NAV} who={s.user.email}>
      <Link href="/admin" className="text-sm text-brand-muted">
        ‹ All cafés
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight">
            {cafe.name} <StatusChip status={cafe.status} />
          </h1>
          <p className="text-brand-muted">
            {cafe.slug}.streakify.com{cafe.customDomain ? ` · ${cafe.customDomain}` : ""} · {cafe.timezone}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <Link href={`/dashboard?as=${cafe.id}`} className="pressable rounded-xl bg-brand-primary px-4 py-2 font-semibold text-brand-on-primary">
            View as owner
          </Link>
          <Link href={`/admin/cafes/${cafe.id}/settings`} className="pressable rounded-xl bg-brand-text/10 px-4 py-2 font-semibold">
            Logo, colors, menu & rewards
          </Link>
          <a href={publicCafeUrl(cafe, "/counter")} className="pressable rounded-xl bg-brand-text/10 px-4 py-2 font-semibold">
            Counter
          </a>
        </div>
      </div>

      <div className="flex gap-1 rounded-xl bg-brand-surface p-1 text-sm sm:w-max">
        <Link href="?tab=admin" className={`rounded-lg px-4 py-1.5 ${tab === "admin" ? "bg-brand-primary font-semibold text-brand-on-primary" : "text-brand-muted"}`}>
          Admin controls
        </Link>
        <Link href="?tab=owner" className={`rounded-lg px-4 py-1.5 ${tab === "owner" ? "bg-brand-primary font-semibold text-brand-on-primary" : "text-brand-muted"}`}>
          What the owner sees
        </Link>
      </div>

      {tab === "owner" ? (
        <OwnerDashboard cafe={cafe} repo={repo} monthParam={q.month} hrefFor={(x) => `?${new URLSearchParams({ tab: "owner", ...x })}`} />
      ) : (
        <>
          <Panel title="Status">
            <StatusButtons cafeId={cafe.id} status={cafe.status} />
            <p className="text-sm text-brand-muted">Paused or cancelled: the counter shows &ldquo;Rewards paused&rdquo;, customers keep everything, daily texts stop.</p>
          </Panel>
          <Panel title="Details, plan & POS">
            <CafeAdminForm cafe={cafe} />
          </Panel>
          <Panel title="Team (owner & managers)">
            <TeamPanel cafeId={cafe.id} members={members.map((m) => ({ id: m.id, email: m.email, name: m.name, title: m.title }))} />
          </Panel>
          <div className="grid gap-6 md:grid-cols-2">
            <Panel title="Counter tablet">
              <PinForm cafeId={cafe.id} />
            </Panel>
            <Panel title="Demo mode">
              <p className="text-sm text-brand-muted">{cafe.isDemo ? "This café is in demo mode (fake customers, counter open without PIN)." : "Fill with fake customers to pitch with this café's own branding."}</p>
              <DemoToggle cafeId={cafe.id} isDemo={cafe.isDemo} />
            </Panel>
          </div>
          <Panel title="Reports & data">
            <div className="flex flex-wrap gap-2">
              <a className="pressable rounded-xl bg-brand-text/10 px-4 py-2 font-semibold" href={`/api/report/${cafe.slug}/${last}`}>
                PDF {formatMonth(last)}
              </a>
              <a className="pressable rounded-xl bg-brand-text/10 px-4 py-2 font-semibold" href={`/api/report/${cafe.slug}/${month}`}>
                PDF {formatMonth(month)} (so far)
              </a>
              <EmailReportButton cafeId={cafe.id} month={last} label={`Send ${formatMonth(last)} report to owner`} />
            </div>
            <div className="flex flex-wrap gap-2 text-sm">
              <span className="text-brand-muted">Export CSV:</span>
              {["customers", "visits", "rewards"].map((t) => (
                <a key={t} className="text-brand-primary underline" href={`/api/admin/cafes/${cafe.id}/export?type=${t}`}>
                  {t}
                </a>
              ))}
            </div>
          </Panel>
          <Panel title="Recent activity">
            <AuditTable rows={audit} cafeNames={new Map([[cafe.id, cafe.name]])} />
          </Panel>
          <Panel title="Danger zone" id="danger">
            <DeleteCafe cafeId={cafe.id} name={cafe.name} />
          </Panel>
        </>
      )}
    </AppShell>
  );
}

export default function Page(props: PageProps<"/admin/cafes/[id]">) {
  return (
    <Suspense fallback={<div className="min-h-dvh" />}>
      <Inner {...props} />
    </Suspense>
  );
}
