/**
 * COUNTER SCREEN (tablet). URL: sanaacafe.streakify.com/counter
 * Server part: loads the café and checks whether this tablet is unlocked,
 * then hands everything to the interactive <Counter> component.
 */
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ForceDark } from "@/components/CafeTheme";
import { getRepo } from "@/lib/data";
import { SHOWCASE } from "@/lib/demo/generate";
import { monthlyLeaderboard } from "@/lib/leaderboard";
import { privacyNotice, smsConsentText } from "@/lib/privacy";
import { resolveCafe } from "@/lib/tenant";
import { cafeBase } from "@/lib/urls";
import { isCounterUnlocked } from "./actions";
import { Counter } from "./Counter";

async function CounterLoader({ params }: PageProps<"/site/[site]/counter">) {
  await connection(); // this screen is always live, never pre-built
  const { site } = await params;
  const cafe = await resolveCafe(site);
  if (!cafe) notFound();
  const unlocked = await isCounterUnlocked(site);
  const leaderboard = unlocked ? await monthlyLeaderboard(cafe) : [];
  const base = await cafeBase();
  const showcase = cafe.isDemo
    ? await Promise.all(
        SHOWCASE.map(async ({ display, firstName, story, phone }) => {
          const c = await getRepo().findCustomerByPhone(cafe.id, phone);
          return { display, firstName, story, phoneUrl: c ? `${base}/me/${c.publicToken}` : null };
        }),
      )
    : [];
  return (
    <>
      <ForceDark brand={cafe.brand} />
      <Counter
        siteKey={site}
        unlocked={unlocked}
        cafe={{
          name: cafe.name,
          primary: cafe.brand.colors.primary,
          logoUrl: cafe.brand.logoUrl,
          tagline: cafe.brand.tagline ?? null,
          isDemo: cafe.isDemo,
          privacyNotice: privacyNotice(cafe.name),
          smsConsent: smsConsentText(cafe.name),
          leaderboardPrize: cafe.program.leaderboardPrize ?? null,
          referralsOn: cafe.program.referral.enabled,
        }}
        leaderboard={leaderboard.map(({ rank, firstName, visits }) => ({ rank, firstName, visits }))}
        showcase={showcase}
      />
    </>
  );
}

export default function CounterPage(props: PageProps<"/site/[site]/counter">) {
  return (
    <Suspense fallback={<div className="flex-1" />}>
      <CounterLoader {...props} />
    </Suspense>
  );
}
