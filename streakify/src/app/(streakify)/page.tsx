/**
 * streakify.com: the public landing page (your sales page).
 */
import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-dvh bg-[#0b0b0c] px-4 py-16 text-neutral-100">
      <div className="mx-auto max-w-2xl">
        <p className="text-sm uppercase tracking-[0.3em] text-amber-300">Streakify</p>
        <h1 className="mt-3 text-4xl font-bold leading-tight sm:text-5xl">Turn first-time coffee buyers into weekly regulars.</h1>
        <p className="mt-4 text-lg text-white/70">
          Customers type their phone number at the counter. They build a weekly streak, unlock rewards, see exactly how much they&apos;ve saved, and
          compete on a monthly leaderboard. Your logo, your colors, your rewards.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/c/demo/counter" className="rounded-xl bg-amber-400 px-5 py-3 font-semibold text-black">Try the counter demo</Link>
          <Link href="/c/demo/owner" className="rounded-xl bg-white/10 px-5 py-3 font-semibold">See the owner dashboard</Link>
        </div>
        <ul className="mt-12 grid gap-4 sm:grid-cols-2">
          {[
            ["Weekly streaks", "Miss a week and drop a level. A monthly streak saver keeps it fair."],
            ["Savings front and center", "“You saved $4.50 today. Come back by Sunday to save $6 next time.”"],
            ["Profit view", "See reward cost vs. extra revenue from repeat visits, every month."],
            ["Works with Toast", "Cashiers apply one “Streak Reward” discount. Purchase verification built in."],
          ].map(([t, d]) => (
            <li key={t} className="rounded-2xl bg-white/5 p-5">
              <p className="font-semibold">{t}</p>
              <p className="mt-1 text-sm text-white/60">{d}</p>
            </li>
          ))}
        </ul>
        <p className="mt-12 text-sm text-white/40">
          <Link href="/admin">Admin</Link> · <a href="/api/health">System check</a>
        </p>
      </div>
    </main>
  );
}
