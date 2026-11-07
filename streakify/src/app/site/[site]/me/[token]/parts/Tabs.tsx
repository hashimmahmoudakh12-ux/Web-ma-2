"use client";
/** The four tabs of the customer app: Home, Badges, Passport, Friends. */
import { Check, ChevronRight, Copy, Lock, Share2, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Countdown } from "@/components/Countdown";
import { Flame, flameTier } from "@/components/game/Flame";
import { haptics } from "@/components/game/feedback";
import { Leaderboard } from "@/components/Leaderboard";
import { Sheet } from "@/components/Sheet";
import type { AppData } from "../CustomerApp";
import { createSquadAction, joinSquadAction, leaveSquadAction } from "../actions";
import { MysteryCard } from "./Mystery";
import { Dallah, mascotPalette, type Mood } from "@/components/motion/Dallah";
import { sounds } from "@/components/game/feedback";
import { InstallCard } from "./pwa";

function Bar({ value, max, className = "" }: { value: number; max: number; className?: string }) {
  const pct = Math.round((Math.min(value, max) / Math.max(1, max)) * 100);
  return (
    <div className={`h-2 w-full overflow-hidden rounded-full bg-brand-text/10 ${className}`} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-brand-primary transition-[width] duration-700" style={{ width: `${pct}%`, transitionTimingFunction: "var(--spring)" }} />
    </div>
  );
}

function SectionTitle({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between px-1 pt-2">
      <h2 className="text-xl font-bold tracking-tight">{children}</h2>
      {aside && <span className="text-sm text-brand-muted">{aside}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// HOME
// ---------------------------------------------------------------------------

function Mascot({ worried, primary }: { worried: boolean; primary: string }) {
  const [mood, setMood] = useState<Mood | null>(null);
  return (
    <div className="absolute right-2 top-2">
      <Dallah
        size={78}
        palette={mascotPalette(primary)}
        mood={mood ?? (worried ? "worried" : "idle")}
        label={worried ? "Your dallah looks worried: your streak ends soon" : "Your dallah mascot"}
        onClick={() => {
          sounds.squish();
          haptics.tap();
          setMood("cheer");
          setTimeout(() => setMood(null), 1600);
        }}
      />
    </div>
  );
}

export function HomeTab({ data }: { data: AppData }) {
  const tier = flameTier(data.streakWeeks);
  return (
    <>
      <section className="card relative overflow-hidden p-5">
        <Mascot worried={Boolean(data.risk)} primary={data.cafe.primary} />
        <p className="text-brand-muted">Hi {data.me.firstName} 👋</p>
        <div className="mt-1 flex items-center gap-4">
          <Flame weeks={data.streakWeeks} size={104} />
          <div className="min-w-0">
            <p className="text-5xl font-bold tracking-tight tabular-nums">{data.streakWeeks}</p>
            <p className="font-semibold">week streak</p>
            <p className="text-sm text-brand-muted">{tier.label} flame</p>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between">
          <span className="rounded-full bg-brand-primary px-3 py-1 text-sm font-semibold text-brand-on-primary">
            {data.level.icon} {data.level.name}
          </span>
          <span className="text-sm tabular-nums text-brand-muted">{data.xp.toLocaleString()} XP</span>
        </div>
        <Bar value={data.fraction * 100} max={100} className="mt-3 h-3" />
        <p className="mt-2 text-sm">{data.progressLine}</p>
        {data.level.perk && <p className="mt-2 text-sm font-semibold text-brand-primary">✨ {data.level.perk}</p>}
      </section>

      <InstallCard cafeName={data.cafe.name} />

      {data.risk && <p className="card border border-brand-primary/50 p-4 font-semibold">{data.risk}</p>}
      {data.awayLines.map((l) => (
        <p key={l} className="card p-4 text-sm text-brand-muted">
          {l}
        </p>
      ))}

      <div className="grid grid-cols-2 gap-3">
        <div className="card p-4">
          <p className="text-sm text-brand-muted">{data.goalMet ? "This week ✓ Next visit by" : "Visit this week by"}</p>
          <p className="font-semibold">{data.deadlineLabel}</p>
          <p className="text-xs text-brand-muted">
            <Countdown to={data.deadlineAt} /> left · {data.saversLeft} saver{data.saversLeft === 1 ? "" : "s"} left
          </p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-brand-muted">Total saved</p>
          <p className="text-2xl font-bold text-brand-primary">{data.totalSaved}</p>
          <p className="text-xs text-brand-muted">since you joined</p>
        </div>
      </div>

      <MysteryCard data={data} />

      {data.events.map((e) => (
        <div key={e.name} className="card flex items-center gap-3 p-4" style={{ background: `linear-gradient(135deg, color-mix(in srgb, var(--brand-primary) 22%, var(--brand-surface)), var(--brand-surface))` }}>
          <span className="text-4xl" aria-hidden>
            {e.icon}
          </span>
          <div>
            <p className="font-bold">
              {e.name} · {e.multiplier}× XP
            </p>
            <p className="text-sm text-brand-muted">
              {e.description}
              {e.hours ? ` (${e.hours})` : ""} · until {e.ends}
            </p>
          </div>
        </div>
      ))}

      <SectionTitle>What&apos;s next</SectionTitle>
      <div className="grid grid-cols-3 gap-3" data-no-swipe>
        <div className="card p-3">
          <p className="text-2xl" aria-hidden>
            {data.next?.icon ?? "👑"}
          </p>
          <p className="mt-1 text-xs text-brand-muted">Next level</p>
          <p className="text-sm font-semibold leading-tight">{data.next ? data.next.name : "Maxed out!"}</p>
          {data.next && <p className="text-xs text-brand-muted">{data.next.xpToNext} XP</p>}
        </div>
        <div className="card p-3">
          <p className="text-2xl" aria-hidden>
            {data.whatsNext.badge?.icon ?? "🏅"}
          </p>
          <p className="mt-1 text-xs text-brand-muted">Next badge</p>
          <p className="text-sm font-semibold leading-tight">{data.whatsNext.badge?.name ?? "All collected!"}</p>
          {data.whatsNext.badge && <Bar value={data.whatsNext.badge.current} max={data.whatsNext.badge.target} className="mt-1.5" />}
        </div>
        <div className="card p-3">
          <p className="text-2xl" aria-hidden>
            🎁
          </p>
          <p className="mt-1 text-xs text-brand-muted">Next reward</p>
          <p className="text-sm font-semibold leading-tight">{data.whatsNext.reward?.name ?? "Keep going"}</p>
          {data.whatsNext.reward && <p className="text-xs text-brand-muted">~{data.whatsNext.reward.visitsAway} visits</p>}
        </div>
      </div>

      {data.challenges.length > 0 && (
        <>
          <SectionTitle>Challenges</SectionTitle>
          <div className="card divide-y divide-brand-text/5">
            {data.challenges.map((c) => (
              <div key={c.id} className="flex items-center gap-3 p-4">
                <span className="text-2xl" aria-hidden>
                  {c.done ? "✅" : c.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className={`font-semibold ${c.done ? "text-brand-muted line-through" : ""}`}>{c.title}</p>
                    <span className="shrink-0 text-xs text-brand-muted">{c.period}</span>
                  </div>
                  <Bar value={c.current} max={c.target} className="mt-2" />
                  <p className="mt-1 text-xs text-brand-muted">
                    {c.current}/{c.target} · +{c.xp} XP{c.reward ? ` + ${c.reward}` : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <SectionTitle aside={data.rewards.length ? "Tap “Use now” at the counter" : undefined}>Rewards ready</SectionTitle>
      <div className="card divide-y divide-brand-text/5">
        {data.rewards.length === 0 && <p className="p-4 text-sm text-brand-muted">None right now. {data.progressLine}</p>}
        {data.rewards.map((r) => (
          <div key={r.id} className="flex items-center justify-between p-4">
            <span className="font-semibold">🎁 {r.name}</span>
            <span className="text-brand-muted">{r.value}</span>
          </div>
        ))}
      </div>

      <WalletButtons data={data} />
    </>
  );
}

function WalletButtons({ data }: { data: AppData }) {
  if (!data.wallet.apple && !data.wallet.google) {
    return (
      <p className="flex items-center gap-2 px-1 text-xs text-brand-muted">
        <Wallet className="h-4 w-4" /> Apple & Google Wallet passes are coming soon.
      </p>
    );
  }
  return (
    <div className="grid gap-2">
      {data.wallet.apple && (
        <a href={data.wallet.apple} className="pressable flex items-center justify-center gap-2 rounded-2xl bg-black py-3.5 font-semibold text-white">
          <Wallet className="h-5 w-5" /> Add to Apple Wallet
        </a>
      )}
      {data.wallet.google && (
        <a href={data.wallet.google} className="pressable flex items-center justify-center gap-2 rounded-2xl bg-[#1f1f1f] py-3.5 font-semibold text-white">
          <Wallet className="h-5 w-5" /> Add to Google Wallet
        </a>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// BADGES
// ---------------------------------------------------------------------------

export function BadgesTab({ data }: { data: AppData }) {
  const [open, setOpen] = useState<AppData["badges"][number] | null>(null);
  const earned = data.badges.filter((b) => b.earnedOn).length;
  return (
    <>
      <SectionTitle aside={`${earned} of ${data.badges.length}`}>Badges</SectionTitle>
      <div className="grid grid-cols-3 gap-3">
        {data.badges.map((b) => (
          <button
            key={b.key}
            type="button"
            onClick={() => {
              haptics.tap();
              setOpen(b);
            }}
            className="pressable card flex flex-col items-center p-3 text-center"
          >
            <span className="relative flex h-16 w-16 items-center justify-center rounded-full" style={{ background: b.earnedOn ? "color-mix(in srgb, var(--brand-primary) 18%, transparent)" : "color-mix(in srgb, var(--brand-text) 6%, transparent)" }}>
              <span className="text-4xl" style={b.earnedOn ? undefined : { filter: "brightness(0)", opacity: 0.22 }} aria-hidden>
                {b.icon}
              </span>
              {!b.earnedOn && <Lock className="absolute bottom-0 right-0 h-4 w-4 rounded-full bg-brand-surface p-0.5 text-brand-muted" aria-label="Locked" />}
            </span>
            <span className={`mt-2 text-xs font-semibold leading-tight ${b.earnedOn ? "" : "text-brand-muted"}`}>{b.earnedOn ? b.name : "???"}</span>
            {!b.earnedOn && b.progress && <Bar value={b.progress.current} max={b.progress.target} className="mt-1.5 h-1" />}
          </button>
        ))}
      </div>
      <Sheet open={open !== null} onClose={() => setOpen(null)}>
        {open && (
          <div className="flex flex-col items-center pb-4 text-center">
            <span className="animate-pop text-8xl" style={open.earnedOn ? undefined : { filter: "brightness(0)", opacity: 0.25 }} aria-hidden>
              {open.icon}
            </span>
            <p className="mt-3 text-2xl font-bold">{open.name}</p>
            <p className="text-brand-muted">{open.description}</p>
            {open.earnedOn ? (
              <p className="mt-3 rounded-full bg-brand-primary/15 px-4 py-1.5 text-sm font-semibold text-brand-primary">Earned {open.earnedOn}</p>
            ) : open.progress ? (
              <div className="mt-4 w-full max-w-xs">
                <Bar value={open.progress.current} max={open.progress.target} />
                <p className="mt-1 text-sm text-brand-muted">
                  {open.progress.current} / {open.progress.target}
                </p>
              </div>
            ) : (
              <p className="mt-3 text-sm text-brand-muted">Locked</p>
            )}
            {open.xp > 0 && <p className="mt-2 text-sm text-brand-muted">+{open.xp} XP when earned</p>}
          </div>
        )}
      </Sheet>
    </>
  );
}

// ---------------------------------------------------------------------------
// DRINK PASSPORT
// ---------------------------------------------------------------------------

export function PassportTab({ data }: { data: AppData }) {
  const total = data.passport.reduce((a, c) => a + c.items.length, 0);
  const got = data.passport.reduce((a, c) => a + c.items.filter((i) => i.stampedOn).length, 0);
  return (
    <>
      <SectionTitle aside={`${got} of ${total} stamps`}>Drink passport</SectionTitle>
      <p className="px-1 text-sm text-brand-muted">Try something new and tap it on the tablet after you check in. Fill a page to win its reward.</p>
      {data.passport.map((cat) => {
        const n = cat.items.filter((i) => i.stampedOn).length;
        return (
          <section key={cat.id} className="card p-4">
            <div className="flex items-center justify-between">
              <p className="font-bold">
                {cat.icon} {cat.name}
              </p>
              <span className="text-sm text-brand-muted">
                {n}/{cat.items.length}
              </span>
            </div>
            {cat.reward && (
              <p className={`text-xs ${cat.done ? "font-semibold text-brand-primary" : "text-brand-muted"}`}>{cat.done ? `✓ Completed: ${cat.reward} earned` : `Complete the page: ${cat.reward}`}</p>
            )}
            <div className="mt-3 grid grid-cols-3 gap-3">
              {cat.items.map((i) => (
                <div key={i.id} className="flex flex-col items-center text-center">
                  <span
                    className={`flex h-16 w-16 items-center justify-center rounded-full text-3xl ${i.stampedOn ? "animate-pop" : "border-2 border-dashed border-brand-muted/40"}`}
                    style={i.stampedOn ? { background: "color-mix(in srgb, var(--brand-primary) 20%, transparent)", transform: "rotate(-8deg)" } : undefined}
                  >
                    <span style={i.stampedOn ? undefined : { filter: "grayscale(1)", opacity: 0.35 }} aria-hidden>
                      {i.icon}
                    </span>
                  </span>
                  <span className="mt-1 text-xs font-medium leading-tight">{i.name}</span>
                  <span className="text-[10px] text-brand-muted">{i.stampedOn ?? "Not yet"}</span>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------------------
// FRIENDS: squad, referral, leaderboard
// ---------------------------------------------------------------------------

export function FriendsTab({ data }: { data: AppData }) {
  return (
    <>
      {data.squads.enabled && <SquadCard data={data} />}
      {data.referral.enabled && <ReferralCard data={data} />}
      <Leaderboard
        entries={data.leaderboard.entries.map((e) => ({ ...e, customerId: e.isMe ? "me" : undefined }))}
        highlightId="me"
        prize={data.leaderboard.prize}
        monthLabel={data.leaderboard.month}
      />
      {!data.prefs.leaderboardOptIn && <p className="px-1 text-center text-sm text-brand-muted">You&apos;re hidden from the leaderboard. Turn it on in Settings to compete.</p>}
    </>
  );
}

function SquadCard({ data }: { data: AppData }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const s = data.squad;
  if (s) {
    const done = s.members.filter((m) => m.doneThisWeek).length;
    return (
      <section className="card p-5">
        <div className="flex items-center gap-3">
          <Flame weeks={s.streakWeeks} size={56} />
          <div className="flex-1">
            <p className="text-sm text-brand-muted">Your squad</p>
            <p className="text-xl font-bold">{s.name}</p>
            <p className="text-sm">{s.streakWeeks}-week squad streak</p>
          </div>
        </div>
        <p className="mt-3 text-sm text-brand-muted">
          When everyone visits this week, you all get +{data.squads.xpPerWeek} XP and the squad streak grows. {done}/{s.members.length} done this week.
        </p>
        <ul className="mt-3 space-y-2">
          {s.members.map((m, i) => (
            <li key={i} className="flex items-center justify-between rounded-xl bg-brand-bg px-3 py-2">
              <span>
                {m.firstName}
                {m.isYou && <span className="ml-1 text-xs text-brand-primary">YOU</span>}
              </span>
              {m.doneThisWeek ? <Check className="h-5 w-5 text-green-500" aria-label="Visited this week" /> : <span className="text-xs text-brand-muted">not yet</span>}
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-center justify-between">
          <ShareButton text={`Join my squad "${s.name}" at ${data.cafe.name}! Open your rewards app → Friends → Join a squad → code ${s.code}`} label={`Invite (code ${s.code})`} />
          <button
            type="button"
            disabled={pending}
            className="text-sm text-red-400"
            onClick={() => {
              if (confirm("Leave this squad?")) start(async () => (await leaveSquadAction(data.siteKey, data.token), router.refresh()));
            }}
          >
            Leave
          </button>
        </div>
      </section>
    );
  }
  return (
    <section className="card space-y-3 p-5">
      <p className="text-xl font-bold">👯 Start a squad</p>
      <p className="text-sm text-brand-muted">
        Team up with up to {data.squads.maxMembers - 1} friends and keep a group streak. Every week everyone visits, you all get +{data.squads.xpPerWeek} XP.
      </p>
      <div className="flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} placeholder="Squad name" className="min-w-0 flex-1 rounded-xl bg-brand-bg px-3 py-2.5 outline-none ring-brand-primary focus:ring-2" />
        <button
          type="button"
          disabled={pending}
          className="pressable rounded-xl bg-brand-primary px-4 font-semibold text-brand-on-primary disabled:opacity-50"
          onClick={() =>
            start(async () => {
              const r = await createSquadAction(data.siteKey, data.token, name);
              setMsg(r.ok ? null : r.message);
              router.refresh();
            })
          }
        >
          Create
        </button>
      </div>
      <div className="flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          maxLength={8}
          placeholder="Friend's squad code"
          className="min-w-0 flex-1 rounded-xl bg-brand-bg px-3 py-2.5 font-mono uppercase outline-none ring-brand-primary focus:ring-2"
        />
        <button
          type="button"
          disabled={pending || !code}
          className="pressable rounded-xl bg-brand-text/10 px-4 font-semibold disabled:opacity-50"
          onClick={() =>
            start(async () => {
              const r = await joinSquadAction(data.siteKey, data.token, code);
              setMsg(r.ok ? null : r.message);
              router.refresh();
            })
          }
        >
          Join
        </button>
      </div>
      {msg && <p className="text-sm text-red-400">{msg}</p>}
    </section>
  );
}

function ReferralCard({ data }: { data: AppData }) {
  const homeUrl = typeof window === "undefined" ? "" : `${window.location.origin}${data.base || "/"}`;
  return (
    <section className="card p-5">
      <p className="text-xl font-bold">🤝 Bring a friend</p>
      <p className="mt-1 text-sm text-brand-muted">
        When a friend joins with your code and checks in, you both get +{data.referral.xp} XP. {data.referral.count > 0 && `You've brought ${data.referral.count} so far!`}
      </p>
      <div className="mt-3 flex items-center justify-between rounded-2xl bg-brand-bg px-4 py-3">
        <span className="font-mono text-2xl font-bold tracking-[0.2em]">{data.me.referralCode}</span>
        <CopyButton value={data.me.referralCode} />
      </div>
      <div className="mt-3">
        <ShareButton text={`Join me at ${data.cafe.name} rewards! Tell the tablet my code ${data.me.referralCode} when you sign up and we both get bonus XP. ${homeUrl}`} label="Share my code" full />
      </div>
    </section>
  );
}

function CopyButton({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="pressable flex items-center gap-1 rounded-full bg-brand-surface px-3 py-1.5 text-sm"
      onClick={async () => {
        await navigator.clipboard?.writeText(value).catch(() => {});
        setDone(true);
        haptics.tap();
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {done ? "Copied" : "Copy"}
    </button>
  );
}

function ShareButton({ text, label, full }: { text: string; label: string; full?: boolean }) {
  return (
    <button
      type="button"
      className={`pressable flex items-center justify-center gap-2 rounded-full bg-brand-primary px-4 py-2 font-semibold text-brand-on-primary ${full ? "w-full py-3" : ""}`}
      onClick={async () => {
        haptics.tap();
        if (navigator.share) await navigator.share({ text }).catch(() => {});
        else await navigator.clipboard?.writeText(text).catch(() => {});
      }}
    >
      <Share2 className="h-4 w-4" /> {label} <ChevronRight className="h-4 w-4 opacity-60" />
    </button>
  );
}
