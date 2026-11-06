/**
 * COUNTER SCREEN (tablet). URL: sanaacafe.streakify.com/counter
 * Server part: loads the café and checks whether this tablet is unlocked,
 * then hands everything to the interactive <Counter> component.
 */
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { SHOWCASE } from "@/lib/demo/generate";
import { privacyNotice, smsConsentText } from "@/lib/privacy";
import { resolveCafe } from "@/lib/tenant";
import { monthlyLeaderboard } from "@/lib/leaderboard";
import { isCounterUnlocked } from "./actions";
import { Counter } from "./Counter";

async function CounterLoader({ params }: PageProps<"/site/[site]/counter">) {
  await connection(); // this screen is always live, never pre-built
  const { site } = await params;
  const cafe = await resolveCafe(site);
  if (!cafe) notFound();
  const unlocked = await isCounterUnlocked(site);
  const leaderboard = unlocked ? await monthlyLeaderboard(cafe) : [];
  return (
    <Counter
      siteKey={site}
      unlocked={unlocked}
      cafe={{
        name: cafe.name,
        logoUrl: cafe.brand.logoUrl,
        tagline: cafe.brand.tagline ?? null,
        isDemo: cafe.isDemo,
        privacyNotice: privacyNotice(cafe.name),
        smsConsent: smsConsentText(cafe.name),
        leaderboardPrize: cafe.program.leaderboardPrize ?? null,
      }}
      leaderboard={leaderboard.map(({ rank, firstName, visits }) => ({ rank, firstName, visits }))}
      showcase={cafe.isDemo ? SHOWCASE.map(({ display, firstName, story }) => ({ display, firstName, story })) : []}
    />
  );
}

export default function CounterPage(props: PageProps<"/site/[site]/counter">) {
  return (
    <Suspense fallback={<div className="flex-1" />}>
      <CounterLoader {...props} />
    </Suspense>
  );
}
