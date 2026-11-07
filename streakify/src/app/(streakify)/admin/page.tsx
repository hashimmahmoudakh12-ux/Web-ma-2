/**
 * YOUR ADMIN DASHBOARD (streakify.com/admin): every café at a glance.
 */
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { CafeLogo } from "@/components/CafeLogo";
import { AppShell } from "@/components/shell/AppShell";
import { getAuth, requireAdmin } from "@/lib/auth";
import { getRepo } from "@/lib/data";
import { formatMoney } from "@/lib/money";
import { pushConfigured } from "@/lib/push";
import { twilioConfigured } from "@/lib/sms";
import { localDate, monthRange } from "@/lib/time";
import { appleWalletConfigured, googleWalletConfigured } from "@/lib/wallet";
import { RunJobsButton } from "./AdminWidgets";
import { ADMIN_NAV, StatusChip } from "./shared";

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-4">
      <p className="text-sm text-brand-muted">{label}</p>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-brand-muted">{sub}</p>}
    </div>
  );
}

/** Live café with no check-ins for 3+ days: something's probably wrong (tablet off?). */
function isQuiet(cafe: { status: string; isDemo: boolean }, last: string | null) {
  const live = cafe.status === "trial" || cafe.status === "active";
  return live && !cafe.isDemo && (!last || Date.now() - new Date(last).getTime() > 3 * 86_400_000);
}

function ago(iso: string | null) {
  if (!iso) return "never";
  const h = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  if (h < 1) return "just now";
  if (h < 24) return `${Math.floor(h)}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

async function Overview() {
  await connection();
  const s = await requireAdmin();
  const repo = getRepo();
  const cafes = await repo.listCafes();
  const rows = await Promise.all(
    cafes.map(async (cafe) => {
      const today = localDate(new Date(), cafe.timezone);
      const { from, to } = monthRange(today);
      const [visits, customers, rewards, last] = await Promise.all([
        repo.listVisits(cafe.id, from, to),
        repo.listCustomers(cafe.id),
        repo.listRewardActivity(cafe.id, from, to),
        repo.lastVisitAt(cafe.id),
      ]);
      const quiet = isQuiet(cafe, last);
      return {
        cafe,
        customers: customers.length,
        today: visits.filter((v) => v.localDate === today).length,
        month: visits.length,
        rewards: rewards.filter((r) => r.earnedLocalDate >= from).length,
        last,
        quiet,
      };
    }),
  );
  const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((a, r) => a + f(r), 0);
  const mrr = cafes.filter((c) => c.status === "active").reduce((a, c) => a + c.planPriceCents, 0);
  const auth = getAuth();
  const pills: [string, boolean][] = [
    ["Database", repo.kind === "supabase"],
    ["Real logins + 2FA", auth.kind === "supabase"],
    ["Email", Boolean(process.env.RESEND_API_KEY && process.env.REPORT_FROM_EMAIL)],
    ["Texts", twilioConfigured()],
    ["Push", pushConfigured()],
    ["Apple Wallet", appleWalletConfigured()],
    ["Google Wallet", googleWalletConfigured()],
  ];

  return (
    <AppShell nav={ADMIN_NAV} who={s.user.email}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">All cafés</h1>
          <p className="text-brand-muted">Everything at a glance. Cafés with no check-ins in 3+ days are flagged.</p>
        </div>
        <Link href="/admin/cafes/new" className="pressable rounded-xl bg-brand-primary px-4 py-2.5 font-semibold text-brand-on-primary">
          + Add café
        </Link>
      </div>
      {repo.kind === "memory" && (
        <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          Demo storage: data and accounts live in memory and reset when the server restarts. Connect Supabase for real cafés (and 2FA).
        </p>
      )}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Tile label="Cafés" value={String(cafes.length)} sub={`${cafes.filter((c) => c.status === "active").length} active · ${cafes.filter((c) => c.status === "trial").length} trial`} />
        <Tile label="Customers" value={sum((r) => r.customers).toLocaleString()} />
        <Tile label="Check-ins today" value={String(sum((r) => r.today))} sub={`${sum((r) => r.month).toLocaleString()} this month`} />
        <Tile label="Rewards given" value={String(sum((r) => r.rewards))} sub="this month" />
        <Tile label="Your monthly revenue" value={formatMoney(mrr)} sub="active plans" />
      </section>

      <section className="card overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="text-brand-muted">
            <tr className="border-b border-brand-text/10">
              <th className="p-3 font-normal">Café</th>
              <th className="p-3 font-normal">Status</th>
              <th className="p-3 text-right font-normal">Plan</th>
              <th className="p-3 text-right font-normal">Check-ins (month)</th>
              <th className="p-3 text-right font-normal">Customers</th>
              <th className="p-3 font-normal">Last check-in</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.cafe.id} className="border-b border-brand-text/5 last:border-0 hover:bg-brand-text/[0.03]">
                <td className="p-3">
                  <Link href={`/admin/cafes/${r.cafe.id}`} className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl" style={{ background: r.cafe.brand.colors.background }}>
                      <CafeLogo name={r.cafe.name.slice(0, 1)} logoUrl={r.cafe.brand.logoUrl} size="sm" />
                    </span>
                    <span>
                      <span className="block font-semibold">
                        {r.cafe.name} {r.cafe.isDemo && <span className="ml-1 text-xs text-brand-muted">(demo)</span>}
                      </span>
                      <span className="text-xs text-brand-muted">{r.cafe.slug}</span>
                    </span>
                  </Link>
                </td>
                <td className="p-3">
                  <StatusChip status={r.cafe.status} />
                </td>
                <td className="p-3 text-right tabular-nums">{r.cafe.planPriceCents ? `${formatMoney(r.cafe.planPriceCents)}/mo` : "—"}</td>
                <td className="p-3 text-right tabular-nums">{r.month}</td>
                <td className="p-3 text-right tabular-nums">{r.customers}</td>
                <td className="p-3">
                  {r.quiet ? <span className="rounded-full bg-red-500/15 px-2.5 py-0.5 text-xs font-semibold text-red-600 dark:text-red-300">⚠ {ago(r.last)}: check on them</span> : ago(r.last)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card space-y-3 p-5">
        <h2 className="font-semibold">Connections</h2>
        <div className="flex flex-wrap gap-2">
          {pills.map(([k, on]) => (
            <span key={k} className={`rounded-full px-3 py-1 text-xs ${on ? "bg-green-500/15 text-green-700 dark:text-green-300" : "bg-brand-text/10 text-brand-muted"}`}>
              {k}: {on ? "on" : "off"}
            </span>
          ))}
        </div>
        <p className="text-sm text-brand-muted">Daily at 16:00 UTC: streak reminders. On the 1st–3rd: leaderboard prizes and monthly PDF reports to owners.</p>
        <RunJobsButton />
      </section>
    </AppShell>
  );
}

export default function AdminPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh" />}>
      <Overview />
    </Suspense>
  );
}
