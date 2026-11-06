"use client";
/**
 * The interactive counter screen (tablet). Built to stay FAST: the customer
 * types their number (or scans their Wallet pass), sees XP + rewards for a
 * moment, and the line keeps moving. The big celebrations play on the
 * customer's own phone, not here.
 *
 *   locked -> phone/scan -> (signup) -> result -> back to phone
 */
import { Gift, QrCode, Smartphone, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { CafeLogo } from "@/components/CafeLogo";
import { Flame } from "@/components/game/Flame";
import { Keypad, formatTyped } from "@/components/Keypad";
import { ProgressBar } from "@/components/ProgressBar";
import type { CheckInResult, CheckInView } from "@/lib/checkin/service";
import { lockCounter, resetDemo, submitItems, submitPhone, submitRedeem, submitScan, submitSignUp, unlockCounter } from "./actions";
import { Scanner } from "./Scanner";

type CafeInfo = {
  name: string;
  logoUrl: string | null;
  tagline: string | null;
  isDemo: boolean;
  privacyNotice: string;
  smsConsent: string;
  leaderboardPrize: string | null;
  referralsOn: boolean;
};

type Step =
  | { kind: "locked" }
  | { kind: "phone" }
  | { kind: "signup"; phone: string }
  | { kind: "result"; view: CheckInView }
  | { kind: "notice"; message: string; tone: "info" | "error" };

type Leader = { rank: number; firstName: string; visits: number };
type ShowcaseEntry = { display: string; firstName: string; story: string; phoneUrl: string | null };

const RESULT_TIMEOUT_MS = 30_000;
const SIGNUP_TIMEOUT_MS = 120_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function Counter({
  siteKey,
  unlocked,
  cafe,
  showcase,
  leaderboard,
}: {
  siteKey: string;
  unlocked: boolean;
  cafe: CafeInfo;
  showcase: ShowcaseEntry[];
  leaderboard: Leader[];
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(unlocked ? { kind: "phone" } : { kind: "locked" });
  const [digits, setDigits] = useState("");
  const [scanning, setScanning] = useState(false);
  const [pending, startTransition] = useTransition();
  const [touch, setTouch] = useState(0);

  useEffect(() => {
    const timeout = step.kind === "result" || step.kind === "notice" ? RESULT_TIMEOUT_MS : step.kind === "signup" ? SIGNUP_TIMEOUT_MS : null;
    if (!timeout) return;
    const t = setTimeout(() => {
      setDigits("");
      setStep({ kind: "phone" });
      router.refresh();
    }, timeout);
    return () => clearTimeout(t);
  }, [step, touch, router]);

  function handleResult(r: CheckInResult) {
    setDigits("");
    setScanning(false);
    if (r.status === "ok") setStep({ kind: "result", view: r.view });
    else if (r.status === "new") setStep({ kind: "signup", phone: r.phone });
    else if (r.status === "cooldown") setStep({ kind: "notice", message: r.message, tone: "info" });
    else setStep({ kind: "notice", message: r.message, tone: "error" });
  }

  function run<T>(fn: () => Promise<T>, then: (v: T) => void) {
    startTransition(async () => {
      try {
        then(await fn());
      } catch (e) {
        const message = e instanceof Error ? e.message : "";
        if (message.includes("locked")) setStep({ kind: "locked" });
        else setStep({ kind: "notice", message: "Something went wrong. Please try again.", tone: "error" });
      }
    });
  }

  const scanRef = useRef<(code: string) => void>(() => {});
  useEffect(() => {
    scanRef.current = (code: string) => run(() => submitScan(siteKey, code), handleResult);
  });

  // USB/Bluetooth barcode scanners type the code + Enter like a keyboard.
  useEffect(() => {
    if (step.kind !== "phone") return;
    let buf = "";
    let last = 0;
    const onKey = (e: KeyboardEvent) => {
      const now = Date.now();
      if (now - last > 80) buf = "";
      last = now;
      if (e.key === "Enter") {
        if (buf.toUpperCase().startsWith("STRK:")) scanRef.current(buf);
        buf = "";
      } else if (e.key.length === 1) buf += e.key;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step.kind]);

  const home = () => {
    setDigits("");
    setStep({ kind: "phone" });
    router.refresh();
  };

  return (
    <main className="flex flex-1 flex-col px-4 py-5 sm:px-8" onPointerDown={() => setTouch((n) => n + 1)}>
      <header className="flex items-center justify-between gap-4">
        <button type="button" onClick={home} aria-label="Start over">
          <CafeLogo name={cafe.name} logoUrl={cafe.logoUrl} size="md" />
        </button>
        <div className="flex items-center gap-3 text-sm text-brand-muted">
          {cafe.isDemo && <span className="rounded-full bg-brand-primary/20 px-3 py-1 text-brand-primary">Demo mode</span>}
          {step.kind !== "locked" && !cafe.isDemo && (
            <button type="button" className="opacity-40 hover:opacity-100" onClick={() => run(() => lockCounter(siteKey), () => setStep({ kind: "locked" }))}>
              Lock
            </button>
          )}
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center py-5">
        {step.kind === "locked" && <Unlock siteKey={siteKey} onUnlocked={home} />}

        {step.kind === "phone" && (
          <PhoneStep
            digits={digits}
            setDigits={setDigits}
            pending={pending}
            tagline={cafe.tagline}
            leaderboard={leaderboard}
            prize={cafe.leaderboardPrize}
            onScan={() => setScanning(true)}
            onSubmit={() => run(() => submitPhone(siteKey, digits), handleResult)}
          />
        )}

        {step.kind === "signup" && (
          <SignUpStep
            cafe={cafe}
            phone={step.phone}
            pending={pending}
            onCancel={home}
            onSubmit={(form) => run(() => submitSignUp(siteKey, { ...form, phone: step.phone }), handleResult)}
          />
        )}

        {step.kind === "result" && <ResultStep siteKey={siteKey} view={step.view} onDone={home} />}

        {step.kind === "notice" && (
          <div className="mx-auto max-w-xl text-center">
            <p className={`text-2xl ${step.tone === "error" ? "text-red-400" : "text-brand-text"}`}>{step.message}</p>
            <button type="button" onClick={home} className="pressable mt-8 rounded-2xl bg-brand-primary px-8 py-4 text-xl font-semibold text-brand-on-primary">
              OK
            </button>
          </div>
        )}
      </div>

      {scanning && <Scanner onCode={(c) => scanRef.current(c)} onClose={() => setScanning(false)} />}

      {cafe.isDemo && step.kind === "phone" && (
        <DemoPanel
          showcase={showcase}
          onPick={(display) => setDigits(display.replace(/\D/g, ""))}
          onReset={() => run(() => resetDemo(siteKey), () => setStep({ kind: "notice", message: "Demo data reset with fresh fake customers.", tone: "info" }))}
          pending={pending}
        />
      )}
    </main>
  );
}

// ---------------------------------------------------------------------------

function Unlock({ siteKey, onUnlocked }: { siteKey: string; onUnlocked: () => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const submit = (value: string) =>
    startTransition(async () => {
      const r = await unlockCounter(siteKey, value);
      if (r.ok) onUnlocked();
      else {
        setError(r.message ?? "Wrong PIN");
        setPin("");
      }
    });
  return (
    <div className="mx-auto w-full max-w-sm text-center">
      <h1 className="text-2xl font-semibold">Staff: unlock this tablet</h1>
      <p className="mt-1 text-brand-muted">Enter the counter PIN. You only do this once per tablet.</p>
      <p className="my-6 font-mono text-4xl tracking-[0.5em]">{"•".repeat(pin.length) || " "}</p>
      {error && <p className="mb-4 text-red-400">{error}</p>}
      <Keypad
        onDigit={(d) => {
          setPin((pin + d).slice(0, 8));
          setError(null);
        }}
        onBackspace={() => setPin(pin.slice(0, -1))}
        onClear={() => setPin("")}
      />
      <button
        type="button"
        disabled={pin.length < 4 || pending}
        onClick={() => submit(pin)}
        className="pressable mt-4 w-full rounded-2xl bg-brand-primary py-4 text-xl font-semibold text-brand-on-primary disabled:opacity-40"
      >
        {pending ? "Checking…" : "Unlock"}
      </button>
    </div>
  );
}

function PhoneStep({
  digits,
  setDigits,
  pending,
  tagline,
  leaderboard,
  prize,
  onSubmit,
  onScan,
}: {
  digits: string;
  setDigits: (d: string) => void;
  pending: boolean;
  tagline: string | null;
  leaderboard: Leader[];
  prize: string | null;
  onSubmit: () => void;
  onScan: () => void;
}) {
  return (
    <div className="grid items-center gap-8 md:grid-cols-2">
      <div className="text-center md:text-left">
        <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl">Keep your streak going</h1>
        <p className="mt-3 text-xl text-brand-muted">{tagline ?? "Enter your phone number to check in."}</p>
        <p className="mt-8 min-h-[3.5rem] rounded-2xl bg-brand-surface px-6 py-3 text-center font-mono text-3xl tracking-wide sm:text-4xl" aria-live="polite">
          {digits ? formatTyped(digits) : <span className="text-brand-muted/50">(___) ___-____</span>}
        </p>
        <MiniLeaderboard entries={leaderboard.slice(0, 5)} prize={prize} />
      </div>
      <div className="mx-auto w-full max-w-sm">
        <Keypad onDigit={(d) => setDigits((digits + d).slice(0, 10))} onBackspace={() => setDigits(digits.slice(0, -1))} onClear={() => setDigits("")} />
        <button
          type="button"
          disabled={digits.length !== 10 || pending}
          onClick={onSubmit}
          className="pressable mt-4 w-full rounded-2xl bg-brand-primary py-5 text-2xl font-bold text-brand-on-primary shadow-lg disabled:opacity-40"
        >
          {pending ? "Checking in…" : "Check in"}
        </button>
        <button type="button" onClick={onScan} className="pressable mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-surface py-3 text-lg">
          <QrCode className="h-5 w-5" aria-hidden /> Scan Wallet pass
        </button>
      </div>
    </div>
  );
}

function MiniLeaderboard({ entries, prize }: { entries: Leader[]; prize: string | null }) {
  if (!entries.length) return null;
  return (
    <div className="mt-6 rounded-2xl bg-brand-surface p-4 text-left">
      <p className="font-semibold">🏆 This month&apos;s leaderboard</p>
      {prize && <p className="text-sm text-brand-muted">#1 wins: {prize}</p>}
      <ol className="mt-2 space-y-1">
        {entries.map((e) => (
          <li key={e.rank} className="flex justify-between">
            <span>
              <span className="inline-block w-6 text-brand-primary">{e.rank}.</span>
              {e.firstName}
            </span>
            <span className="text-brand-muted">
              {e.visits} {e.visits === 1 ? "visit" : "visits"}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

type SignUpForm = {
  firstName: string;
  birthdayMonth: number | null;
  birthdayDay: number | null;
  privacyAccepted: boolean;
  smsOptIn: boolean;
  leaderboardOptIn: boolean;
  friendCode: string;
};

function SignUpStep({
  cafe,
  phone,
  pending,
  onSubmit,
  onCancel,
}: {
  cafe: CafeInfo;
  phone: string;
  pending: boolean;
  onSubmit: (f: SignUpForm & { privacyAccepted: true }) => void;
  onCancel: () => void;
}) {
  const [f, setF] = useState<SignUpForm>({
    firstName: "",
    birthdayMonth: null,
    birthdayDay: null,
    privacyAccepted: false,
    smsOptIn: false, // never pre-checked: consent must be an active choice
    leaderboardOptIn: false,
    friendCode: "",
  });
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => nameRef.current?.focus(), []);
  const canSubmit = f.firstName.trim().length > 0 && f.privacyAccepted && !pending;
  const set = <K extends keyof SignUpForm>(k: K, v: SignUpForm[K]) => setF((x) => ({ ...x, [k]: v }));
  const field = "mt-1 w-full rounded-xl bg-brand-surface px-4 py-4 text-2xl outline-none ring-brand-primary focus:ring-2";

  return (
    <form
      className="mx-auto w-full max-w-2xl space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) onSubmit({ ...f, privacyAccepted: true });
      }}
    >
      <div>
        <h1 className="text-3xl font-bold">Welcome to {cafe.name} Rewards!</h1>
        <p className="text-brand-muted">Joining with {phone.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, "($1) $2-$3")}. Takes 20 seconds.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-lg">First name or nickname</span>
          <input ref={nameRef} value={f.firstName} onChange={(e) => set("firstName", e.target.value)} maxLength={24} autoComplete="off" className={field} placeholder="e.g. Sara" />
        </label>
        {cafe.referralsOn && (
          <label className="block">
            <span className="text-lg">
              Friend&apos;s code <span className="text-brand-muted">(optional)</span>
            </span>
            <input
              value={f.friendCode}
              onChange={(e) => set("friendCode", e.target.value.toUpperCase())}
              maxLength={8}
              autoComplete="off"
              autoCapitalize="characters"
              className={`${field} font-mono uppercase`}
              placeholder="ABC123"
            />
          </label>
        )}
      </div>
      <fieldset>
        <legend className="text-lg">
          Birthday <span className="text-brand-muted">(optional, for a free birthday drink)</span>
        </legend>
        <div className="mt-1 flex gap-3">
          <select value={f.birthdayMonth ?? ""} onChange={(e) => set("birthdayMonth", e.target.value ? Number(e.target.value) : null)} className="flex-1 rounded-xl bg-brand-surface px-4 py-4 text-xl" aria-label="Birthday month">
            <option value="">Month</option>
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
          <select value={f.birthdayDay ?? ""} onChange={(e) => set("birthdayDay", e.target.value ? Number(e.target.value) : null)} className="w-32 rounded-xl bg-brand-surface px-4 py-4 text-xl" aria-label="Birthday day">
            <option value="">Day</option>
            {Array.from({ length: 31 }, (_, i) => (
              <option key={i} value={i + 1}>
                {i + 1}
              </option>
            ))}
          </select>
        </div>
      </fieldset>
      <div className="space-y-3 rounded-2xl bg-brand-surface p-4">
        <p className="text-sm text-brand-muted">{cafe.privacyNotice}</p>
        <Check checked={f.privacyAccepted} onChange={(v) => set("privacyAccepted", v)}>
          I agree to the privacy notice above. <span className="text-brand-muted">(required)</span>
        </Check>
        <Check checked={f.smsOptIn} onChange={(v) => set("smsOptIn", v)}>
          <span className="text-sm">{cafe.smsConsent}</span>
        </Check>
        <Check checked={f.leaderboardOptIn} onChange={(v) => set("leaderboardOptIn", v)}>
          Show my first name on the monthly leaderboard
          {cafe.leaderboardPrize ? <span className="text-brand-muted"> (this month’s prize: {cafe.leaderboardPrize})</span> : null}.
          <span className="text-brand-muted"> Never your phone number.</span>
        </Check>
      </div>
      <div className="flex gap-3">
        <button type="button" onClick={onCancel} className="pressable rounded-2xl bg-brand-surface px-6 py-4 text-xl">
          Cancel
        </button>
        <button type="submit" disabled={!canSubmit} className="pressable flex-1 rounded-2xl bg-brand-primary py-4 text-2xl font-bold text-brand-on-primary disabled:opacity-40">
          {pending ? "Joining…" : "Join & check in"}
        </button>
      </div>
    </form>
  );
}

function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1 h-6 w-6 shrink-0 accent-[var(--brand-primary)]" />
      <span>{children}</span>
    </label>
  );
}

function ResultStep({ siteKey, view: initial, onDone }: { siteKey: string; view: CheckInView; onDone: () => void }) {
  const [view, setView] = useState(initial);
  const [confirming, setConfirming] = useState<CheckInView["rewards"][number] | null>(null);
  const [stamped, setStamped] = useState<string[]>([]);
  const [stampMsg, setStampMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const redeem = (rewardId: string) =>
    startTransition(async () => {
      const r = await submitRedeem(siteKey, view.customerId, rewardId);
      setConfirming(null);
      if (r.status !== "ok") {
        setError(r.message);
        return;
      }
      setError(null);
      setView((v) => ({
        ...v,
        rewards: v.rewards.filter((x) => r.remainingIds.includes(x.id)),
        savedTodayCents: r.savedTodayCents,
        lines: { ...v.lines, savedToday: r.savedToday, totalSaved: r.totalSaved },
      }));
    });

  const stamp = (id: string) =>
    startTransition(async () => {
      setStamped((s) => [...s, id]);
      const r = await submitItems(siteKey, view.customerId, [id]);
      if (!r.ok) {
        setStampMsg(r.message);
        return;
      }
      setStampMsg(r.newStamps ? `New passport stamp! +${r.xp} XP${r.rewards.length ? ` · ${r.rewards.join(", ")} unlocked` : ""}` : "Logged for this week's challenges.");
    });

  const headline = view.isNewMember ? `Welcome, ${view.firstName}!` : view.leveledUpTo ? `${view.firstName}, you're now ${view.leveledUpTo}!` : `Thanks, ${view.firstName}!`;

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <section className="space-y-4">
        <div className="flex items-center gap-4">
          <Flame weeks={view.streakWeeks} size={84} />
          <div>
            <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl">{headline}</h1>
            <p className="text-brand-muted">
              {view.streakWeeks}-week streak · {view.levelIcon} {view.levelName}
            </p>
          </div>
        </div>
        <div className="rounded-2xl bg-brand-surface p-4">
          <p className="text-4xl font-bold text-brand-primary">+{view.xpGained} XP</p>
          <ul className="mt-1 text-sm text-brand-muted">
            {view.xpLines.map((l, i) => (
              <li key={i}>
                +{l.xp} {l.label}
              </li>
            ))}
          </ul>
          <div className="mt-3">
            <ProgressBar fraction={view.progress.fraction} label={view.progress.line} />
          </div>
        </div>
        {(view.badgesEarned.length > 0 || view.mysteryEarned) && (
          <div className="flex flex-wrap gap-2">
            {view.badgesEarned.map((b) => (
              <span key={b.name} className="animate-pop rounded-full bg-brand-primary/15 px-3 py-1.5 font-semibold text-brand-primary">
                {b.icon} {b.name}
              </span>
            ))}
            {view.mysteryEarned && (
              <span className="animate-pop flex items-center gap-1.5 rounded-full bg-brand-primary px-3 py-1.5 font-semibold text-brand-on-primary">
                <Gift className="h-4 w-4" aria-hidden /> Mystery dallah! Open it on your phone
              </span>
            )}
          </div>
        )}
        {view.levelPerk && <p className="text-lg text-brand-primary">✨ {view.levelPerk[0].toUpperCase() + view.levelPerk.slice(1)}. Ask the cashier!</p>}
        {view.lines.events.map((l) => (
          <p key={l} className="rounded-xl bg-brand-surface p-3 text-brand-muted">
            {l}
          </p>
        ))}
      </section>

      <section className="space-y-4">
        <div className="rounded-2xl bg-brand-surface p-5">
          {view.lines.savedToday && <p className="text-3xl font-bold text-brand-primary">{view.lines.savedToday}</p>}
          <p className="mt-1 text-xl">{view.lines.nextTime}</p>
          <p className="mt-2 text-brand-muted">{view.lines.totalSaved}</p>
        </div>

        {view.rewards.length > 0 && (
          <div className="space-y-2">
            <h2 className="font-semibold">Rewards ready</h2>
            {view.rewards.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 rounded-2xl border border-brand-primary/40 p-3">
                <div>
                  <p className="text-lg font-semibold">
                    {r.isNew && <span className="mr-2 text-brand-primary">NEW</span>}
                    {r.name}
                  </p>
                  <p className="text-sm text-brand-muted">{r.valueLabel} value</p>
                </div>
                <button type="button" onClick={() => setConfirming(r)} className="pressable rounded-xl bg-brand-primary px-5 py-3 font-semibold text-brand-on-primary">
                  Use now
                </button>
              </div>
            ))}
          </div>
        )}
        {error && <p className="text-red-400">{error}</p>}

        {view.menu.length > 0 && (
          <div className="rounded-2xl bg-brand-surface p-4">
            <p className="flex flex-wrap items-center gap-2 font-semibold">
              <Sparkles className="h-4 w-4 text-brand-primary" aria-hidden /> What did you have?
              <span className="font-normal text-brand-muted">Tap for a passport stamp</span>
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {view.menu.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  disabled={stamped.includes(m.id) || pending}
                  onClick={() => stamp(m.id)}
                  className={`pressable rounded-full px-3 py-1.5 text-sm ${stamped.includes(m.id) ? "bg-brand-primary text-brand-on-primary" : "bg-brand-bg"}`}
                >
                  {m.icon} {m.name}
                  {!m.stamped && !stamped.includes(m.id) && <span className="ml-1 text-[10px] font-bold text-brand-primary">NEW</span>}
                </button>
              ))}
            </div>
            {stampMsg && <p className="mt-2 text-sm text-brand-primary">{stampMsg}</p>}
          </div>
        )}

        {view.qrSvg && (
          <div className="flex items-center gap-4 rounded-2xl bg-brand-surface p-4">
            <div data-url={view.personalUrl} className="h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-white p-1" dangerouslySetInnerHTML={{ __html: view.qrSvg }} />
            <p className="text-sm text-brand-muted">
              <span className="flex items-center gap-1.5 text-base font-semibold text-brand-text">
                <Smartphone className="h-4 w-4" aria-hidden /> Your rewards app
              </span>
              Scan to open your badges, passport, challenges and mystery dallahs. Add it to your Home Screen or Wallet.
            </p>
          </div>
        )}

        <button type="button" onClick={onDone} className="pressable w-full rounded-2xl bg-brand-text/10 py-4 text-xl">
          Done
        </button>
      </section>

      {confirming && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true">
          <div className="animate-pop w-full max-w-md rounded-3xl bg-brand-surface p-6 text-center">
            <p className="text-sm uppercase tracking-widest text-brand-muted">For the cashier</p>
            <p className="mt-3 text-2xl font-bold">
              {confirming.name} ({confirming.valueLabel})
            </p>
            <p className="mt-3 text-lg">
              In Toast, apply the <strong className="text-brand-primary">“Streak Reward”</strong> discount for <strong>{confirming.valueLabel}</strong>, then tap Applied.
            </p>
            <div className="mt-6 flex gap-3">
              <button type="button" onClick={() => setConfirming(null)} className="pressable flex-1 rounded-2xl bg-brand-text/10 py-4 text-lg">
                Cancel
              </button>
              <button type="button" disabled={pending} onClick={() => redeem(confirming.id)} className="pressable flex-1 rounded-2xl bg-brand-primary py-4 text-lg font-bold text-brand-on-primary disabled:opacity-50">
                {pending ? "Saving…" : "Applied"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DemoPanel({ showcase, onPick, onReset, pending }: { showcase: ShowcaseEntry[]; onPick: (display: string) => void; onReset: () => void; pending: boolean }) {
  return (
    <aside className="mx-auto mt-4 w-full max-w-5xl rounded-2xl border border-dashed border-brand-muted/40 p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="font-semibold">Pitch shortcuts: tap a demo customer, then Check in</p>
        <button type="button" disabled={pending} onClick={onReset} className="text-sm text-brand-muted underline">
          Reset demo data
        </button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {showcase.map((c) => (
          <div key={c.display} className="rounded-xl bg-brand-surface p-3 text-left">
            <button type="button" onClick={() => onPick(c.display)} className="w-full text-left">
              <span className="font-semibold">{c.firstName}</span> <span className="font-mono text-xs text-brand-muted">{c.display}</span>
              <span className="block text-sm text-brand-muted">{c.story}</span>
            </button>
            {c.phoneUrl && (
              <a href={c.phoneUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-brand-primary">
                <Smartphone className="h-3 w-3" aria-hidden /> Open their phone app
              </a>
            )}
          </div>
        ))}
        <div className="rounded-xl bg-brand-surface p-3 text-sm text-brand-muted">
          <span className="font-semibold text-brand-text">New customer:</span> type any other number, e.g. (313) 555-0199, to see sign-up.
        </div>
      </div>
    </aside>
  );
}
