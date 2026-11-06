/**
 * CUSTOMER PAGE (personal link): sanaacafe.streakify.com/me/<secret token>
 * Shows streak, level, progress bar, total saved, time left this week,
 * rewards ready, and the leaderboard. The long random token in the link is
 * what keeps it private, so no password needed.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { CafeLogo } from "@/components/CafeLogo";
import { Countdown } from "@/components/Countdown";
import { Leaderboard } from "@/components/Leaderboard";
import { ProgressBar } from "@/components/ProgressBar";
import { getRepo } from "@/lib/data";
import { monthlyLeaderboard } from "@/lib/leaderboard";
import { formatMoney } from "@/lib/money";
import { privacyNotice, smsConsentText } from "@/lib/privacy";
import { nextDeadline, progressFor, settle, weekGoalMet } from "@/lib/streak/engine";
import { eventLines, nextUpcomingReward, progressLine, riskLine } from "@/lib/streak/messages";
import { resolveCafe } from "@/lib/tenant";
import { addDays, formatDay, formatMonth, localDate, zonedInstant } from "@/lib/time";
import { Prefs } from "./Prefs";

export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

async function CustomerPage({ params }: PageProps<"/site/[site]/me/[token]">) {
  await connection();
  const { site, token } = await params;
  const cafe = await resolveCafe(site);
  if (!cafe) notFound();
  const repo = getRepo();
  const customer = await repo.getCustomerByToken(cafe.id, token);
  if (!customer) notFound();

  const now = new Date();
  const clock = { now, timeZone: cafe.timezone };
  const today = localDate(now, cafe.timezone);
  // Show the streak as it stands today (applies missed weeks without saving).
  const { state, events } = settle(customer, cafe.program, clock);
  const p = progressFor(state.streakVisits, cafe.program);
  const [rewards, savings, board] = await Promise.all([
    repo.listAvailableRewards(cafe.id, customer.id),
    repo.savings(cafe.id, customer.id, today),
    monthlyLeaderboard(cafe, now),
  ]);
  const deadline = nextDeadline(state, cafe.program, clock);
  const deadlineInstant = zonedInstant(addDays(deadline, 1), 0, 0, cafe.timezone).toISOString();
  const goalMet = weekGoalMet(state, cafe.program, clock);
  const risk = riskLine(state, cafe.program, clock, cafe.currency);
  const upcoming = nextUpcomingReward(state, cafe.program);
  const myRank = board.find((e) => e.customerId === customer.id);
  const lostLines = eventLines(events, cafe.program);

  return (
    <main className="mx-auto w-full max-w-md flex-1 space-y-5 px-4 py-6">
      <header className="flex items-center justify-between">
        <CafeLogo name={cafe.name} logoUrl={cafe.brand.logoUrl} size="sm" />
        <span className="text-sm text-brand-muted">Rewards</span>
      </header>

      <section className="rounded-3xl bg-brand-surface p-6">
        <p className="text-brand-muted">Hi {customer.firstName} 👋</p>
        <div className="mt-2 flex items-end justify-between">
          <div>
            <p className="text-3xl font-bold text-brand-primary">{p.level.name}</p>
            <p className="text-brand-muted">🔥 {state.streakWeeks}-week streak · {state.streakVisits} streak visits</p>
          </div>
          {p.level.perk && <span className="rounded-full bg-brand-primary px-3 py-1 text-sm font-semibold text-brand-on-primary">✨ {p.level.perk}</span>}
        </div>
        <div className="mt-5">
          <ProgressBar fraction={p.fraction} label={progressLine(state, cafe.program)} />
        </div>
        {upcoming && upcoming.visitsAway > 0 && (
          <p className="mt-1 text-sm text-brand-muted">
            Next reward: {upcoming.name} ({formatMoney(upcoming.valueCents, cafe.currency)} value)
          </p>
        )}
      </section>

      <section className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-brand-surface p-4">
          <p className="text-sm text-brand-muted">Total saved</p>
          <p className="text-2xl font-bold text-brand-primary">{formatMoney(savings.totalCents, cafe.currency)}</p>
          <p className="text-xs text-brand-muted">since you joined</p>
        </div>
        <div className="rounded-2xl bg-brand-surface p-4">
          <p className="text-sm text-brand-muted">{goalMet ? "This week done ✓ Next visit by" : "Visit this week by"}</p>
          <p className="text-lg font-semibold">{formatDay(deadline)}</p>
          <p className="text-xs text-brand-muted">
            <Countdown to={deadlineInstant} /> left
          </p>
        </div>
      </section>

      {risk && <p className="rounded-2xl border border-brand-primary p-4 font-semibold">{risk}</p>}
      {lostLines.map((l) => (
        <p key={l} className="rounded-2xl bg-brand-surface p-4 text-brand-muted">{l}</p>
      ))}

      <section className="rounded-2xl bg-brand-surface p-5">
        <h2 className="text-lg font-semibold">Rewards ready</h2>
        {rewards.length === 0 ? (
          <p className="mt-2 text-brand-muted">None right now. {progressLine(state, cafe.program)}</p>
        ) : (
          <>
            <ul className="mt-3 space-y-2">
              {rewards.map((r) => (
                <li key={r.id} className="flex justify-between rounded-xl border border-brand-primary/40 p-3">
                  <span className="font-semibold">{r.name}</span>
                  <span className="text-brand-muted">{formatMoney(r.valueCents, cafe.currency)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-sm text-brand-muted">Check in at the counter and tap “Use now” to redeem.</p>
          </>
        )}
        <p className="mt-3 text-sm text-brand-muted">
          You get {cafe.program.saversPerMonth} streak saver{cafe.program.saversPerMonth === 1 ? "" : "s"} a month. It protects your streak if you miss a week.
        </p>
      </section>

      <Leaderboard entries={board} highlightId={customer.id} prize={cafe.program.leaderboardPrize ?? null} monthLabel={formatMonth(today.slice(0, 7))} />
      {!customer.leaderboardOptIn ? (
        <p className="text-center text-sm text-brand-muted">You&apos;re hidden from the leaderboard. Turn it on below to compete.</p>
      ) : (
        !myRank && <p className="text-center text-sm text-brand-muted">Visit more this month to make the top 10!</p>
      )}

      <Prefs
        siteKey={site}
        token={token}
        leaderboardOptIn={customer.leaderboardOptIn}
        smsOptIn={customer.smsOptIn}
        smsConsent={smsConsentText(cafe.name)}
        privacyNotice={privacyNotice(cafe.name)}
      />
    </main>
  );
}

export default function Page(props: PageProps<"/site/[site]/me/[token]">) {
  return (
    <Suspense fallback={<div className="flex-1" />}>
      <CustomerPage {...props} />
    </Suspense>
  );
}
