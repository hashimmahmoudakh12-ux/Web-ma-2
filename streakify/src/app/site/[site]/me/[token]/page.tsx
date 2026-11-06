/**
 * CUSTOMER APP (personal link): sanaacafe.streakify.com/me/<secret token>
 *
 * Installable to the Home Screen (PWA), works in light & dark mode, and is
 * where the fun happens: flame, XP, badges, passport, challenges, mystery
 * dallahs, squads, referrals, leaderboard, Wallet passes.
 * This server part gathers all the data; <CustomerApp> draws it.
 */
import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { squadView } from "@/lib/checkin/service";
import { getRepo, type Cafe } from "@/lib/data";
import { monthlyLeaderboard } from "@/lib/leaderboard";
import { formatMoney } from "@/lib/money";
import { privacyNotice, smsConsentText } from "@/lib/privacy";
import { pushConfigured } from "@/lib/push";
import { badgeProgress, challengeStatuses, currentEvents, nextDeadline, normalizeGame, progressFor, settle, weekGoalMet } from "@/lib/streak/engine";
import { eventLines, nextBadge, nextUpcomingReward, progressLine, riskLine } from "@/lib/streak/messages";
import { resolveCafe } from "@/lib/tenant";
import { addDays, formatDay, formatMonth, formatShortDay, localDate, zonedInstant } from "@/lib/time";
import { cafeBase } from "@/lib/urls";
import { appleWalletConfigured, googleWalletConfigured } from "@/lib/wallet";
import { CustomerApp, type AppData } from "./CustomerApp";

// iPhone launch screens (portrait, device pixels) for the installed app.
const SPLASH: [number, number, number, number, number][] = [
  // [css width, css height, ratio, px width, px height]
  [430, 932, 3, 1290, 2796],
  [393, 852, 3, 1179, 2556],
  [390, 844, 3, 1170, 2532],
  [428, 926, 3, 1284, 2778],
  [375, 812, 3, 1125, 2436],
  [414, 896, 2, 828, 1792],
  [375, 667, 2, 750, 1334],
];

export async function generateMetadata({ params }: PageProps<"/site/[site]/me/[token]">): Promise<Metadata> {
  const { site, token } = await params;
  const cafe = await resolveCafe(site);
  if (!cafe) return {};
  const base = await cafeBase();
  return {
    title: `${cafe.name} Rewards`,
    robots: { index: false, follow: false },
    referrer: "no-referrer",
    manifest: `${base}/me/${token}/manifest`,
    appleWebApp: {
      capable: true,
      title: cafe.name,
      statusBarStyle: "black-translucent",
      startupImage: SPLASH.map(([w, h, r, pw, ph]) => ({
        url: `/api/splash/${cafe.slug}/${pw}/${ph}`,
        media: `(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${r}) and (orientation: portrait)`,
      })),
    },
    icons: { icon: `/api/icon/${cafe.slug}/192`, apple: `/api/icon/${cafe.slug}/180` },
  };
}

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

async function buildData(cafe: Cafe, token: string, site: string): Promise<AppData | null> {
  const repo = getRepo();
  const raw = await repo.getCustomerByToken(cafe.id, token);
  if (!raw) return null;
  const now = new Date();
  const clock = { now, timeZone: cafe.timezone };
  const today = localDate(now, cafe.timezone);
  const program = cafe.program;
  // Show the streak as it stands today (applies missed weeks, without saving).
  const { state, events } = settle({ ...raw, game: normalizeGame(raw.game) }, program, clock);
  const g = state.game;
  const [rewards, savings, board, squad] = await Promise.all([
    repo.listAvailableRewards(cafe.id, raw.id),
    repo.savings(cafe.id, raw.id, today),
    monthlyLeaderboard(cafe, now),
    squadView(cafe, raw, now),
  ]);
  const p = progressFor(state.xp, program);
  const deadline = nextDeadline(state, program, clock);
  const upcoming = nextUpcomingReward(state, program);
  const nb = nextBadge(state, program, { clock, squadStreakWeeks: squad?.streakWeeks });
  const money = (c: number) => formatMoney(c, cafe.currency);
  const base = await cafeBase();

  return {
    siteKey: site,
    token,
    base,
    cafe: { name: cafe.name, slug: cafe.slug, logoUrl: cafe.brand.logoUrl, primary: cafe.brand.colors.primary, isDemo: cafe.isDemo },
    me: { firstName: raw.firstName, referralCode: raw.referralCode },
    level: { name: p.level.name, icon: p.level.icon, perk: p.level.perk ?? null },
    next: p.next ? { name: p.next.name, icon: p.next.icon, xpToNext: p.xpToNext, reward: p.next.reward?.name ?? null } : null,
    xp: state.xp,
    fraction: p.fraction,
    progressLine: progressLine(state, program),
    streakWeeks: state.streakWeeks,
    goalMet: weekGoalMet(state, program, clock),
    deadlineLabel: formatDay(deadline),
    deadlineAt: zonedInstant(addDays(deadline, 1), 0, 0, cafe.timezone).toISOString(),
    risk: riskLine(state, program, clock, cafe.currency),
    awayLines: eventLines(events, program),
    saversLeft: Math.max(0, program.saversPerMonth - (state.saverMonth === today.slice(0, 7) ? state.saversUsedInMonth : 0)),
    whatsNext: {
      reward: upcoming ? { name: upcoming.name, visitsAway: upcoming.visitsAway, value: money(upcoming.valueCents) } : null,
      badge: nb,
    },
    totalSaved: money(savings.totalCents),
    rewards: rewards.map((r) => ({ id: r.id, name: r.name, value: money(r.valueCents) })),
    mystery: g.mystery.filter((b) => !b.openedAt).map((b) => b.id),
    mysteryHistory: g.mystery.filter((b) => b.openedAt).slice(-5).reverse().map((b) => ({ name: b.prizeName ?? "Prize", icon: b.prizeIcon ?? "🎁" })),
    events: currentEvents(program, clock).map((e) => ({
      name: e.name,
      icon: e.icon,
      description: e.description,
      multiplier: e.xpMultiplier,
      hours: e.fromHour !== undefined || e.toHour !== undefined ? `${e.fromHour ?? 0}:00–${(e.toHour ?? 24) % 24 === 0 ? "midnight" : `${e.toHour}:00`}` : null,
      ends: formatShortDay(e.end),
    })),
    challenges: challengeStatuses(state, program, clock).map((s) => ({
      id: `${s.challenge.id}@${s.periodKey}`,
      title: s.challenge.title,
      icon: s.challenge.icon,
      current: s.current,
      target: s.target,
      done: s.done,
      xp: s.challenge.xp,
      reward: s.challenge.reward?.name ?? null,
      period: s.challenge.period === "weekly" ? "This week" : s.challenge.period === "event" ? "Event" : "Anytime",
    })),
    badges: program.badges.map((b) => {
      const prog = badgeProgress(b, state, program, { clock, squadStreakWeeks: squad?.streakWeeks });
      return {
        key: b.key,
        name: b.name,
        icon: b.icon,
        description: b.description,
        xp: b.xp,
        earnedOn: g.badges[b.key] ? formatShortDay(localDate(new Date(g.badges[b.key]), cafe.timezone)) : null,
        progress: prog ? { current: Math.min(prog.current, prog.target), target: prog.target } : null,
      };
    }),
    passport: program.menu.categories.map((cat) => {
      const items = program.menu.items.filter((i) => i.categoryId === cat.id);
      return {
        id: cat.id,
        name: cat.name,
        icon: cat.icon,
        reward: cat.reward?.name ?? null,
        done: g.categoriesDone.includes(cat.id),
        items: items.map((i) => ({ id: i.id, name: i.name, icon: i.icon, stampedOn: g.stamps[i.id] ? formatShortDay(g.stamps[i.id]) : null })),
      };
    }),
    squad,
    squads: { enabled: program.squads.enabled, maxMembers: program.squads.maxMembers, xpPerWeek: program.squads.xpPerWeek },
    referral: { enabled: program.referral.enabled, xp: program.referral.xp, count: g.referrals },
    leaderboard: { entries: board.map((e) => ({ rank: e.rank, firstName: e.firstName, visits: e.visits, isMe: e.customerId === raw.id })), prize: program.leaderboardPrize ?? null, month: formatMonth(today.slice(0, 7)) },
    prefs: { leaderboardOptIn: raw.leaderboardOptIn, smsOptIn: raw.smsOptIn, smsConsent: smsConsentText(cafe.name), privacyNotice: privacyNotice(cafe.name) },
    celebrations: g.inbox.filter((c) => !g.seenAt || c.at > g.seenAt).slice(-6),
    wallet: {
      apple: appleWalletConfigured() ? `/api/wallet/apple/${cafe.slug}/${token}` : null,
      google: googleWalletConfigured() ? `/api/wallet/google/${cafe.slug}/${token}` : null,
    },
    push: { enabled: pushConfigured(), vapidKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null },
  };
}

async function Loader({ params }: PageProps<"/site/[site]/me/[token]">) {
  await connection();
  const { site, token } = await params;
  const cafe = await resolveCafe(site);
  if (!cafe) notFound();
  const data = await buildData(cafe, token, site);
  if (!data) notFound();
  return (
    <>
      {/* Status-bar color of the installed app (React moves these into <head>) */}
      <meta name="theme-color" media="(prefers-color-scheme: dark)" content={cafe.brand.colors.background} />
      <meta name="theme-color" media="(prefers-color-scheme: light)" content="#f5f5f7" />
      <CustomerApp data={data} />
    </>
  );
}

export default function Page(props: PageProps<"/site/[site]/me/[token]">) {
  return (
    <Suspense fallback={<div className="flex-1" />}>
      <Loader {...props} />
    </Suspense>
  );
}
