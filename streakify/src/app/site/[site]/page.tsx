/**
 * Café home page (sanaacafe.streakify.com). Phase 2 adds the personal
 * customer page; for now it explains the program.
 */
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CafeLogo } from "@/components/CafeLogo";
import { formatMoney } from "@/lib/money";
import { resolveCafe } from "@/lib/tenant";

async function Home({ params }: PageProps<"/site/[site]">) {
  const cafe = await resolveCafe((await params).site);
  if (!cafe) notFound();
  const { program } = cafe;
  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-10">
      <div className="flex justify-center">
        <CafeLogo name={cafe.name} logoUrl={cafe.brand.logoUrl} size="lg" />
      </div>
      <h1 className="mt-6 text-center text-2xl font-bold">{cafe.name} Rewards</h1>
      <p className="mt-2 text-center text-brand-muted">
        Visit every week to build your streak. Type your phone number on the tablet at the counter after you pay.
      </p>
      <ul className="mt-8 space-y-3">
        {program.welcomeReward?.enabled && (
          <li className="rounded-xl bg-brand-surface p-4">
            <span className="font-semibold text-brand-primary">2nd visit:</span> {program.welcomeReward.name}
          </li>
        )}
        {program.levels.slice(1).map((l) => (
          <li key={l.key} className="rounded-xl bg-brand-surface p-4">
            <span className="font-semibold text-brand-primary">{l.name}</span>
            <span className="text-brand-muted"> · {l.minVisits} visits</span>
            {l.reward && <div>{l.reward.name} ({formatMoney(l.reward.valueCents, cafe.currency)} value)</div>}
            {l.perk && <div className="capitalize">{l.perk}</div>}
          </li>
        ))}
        {program.birthdayReward?.enabled && (
          <li className="rounded-xl bg-brand-surface p-4">
            <span className="font-semibold text-brand-primary">Birthday:</span> {program.birthdayReward.name}
          </li>
        )}
      </ul>
      <p className="mt-6 text-center text-sm text-brand-muted">
        Miss a week and you drop one level, but you keep every reward you earned. You get {program.saversPerMonth} streak
        saver{program.saversPerMonth === 1 ? "" : "s"} a month.
      </p>
    </main>
  );
}

export default function Page(props: PageProps<"/site/[site]">) {
  return (
    <Suspense>
      <Home {...props} />
    </Suspense>
  );
}
