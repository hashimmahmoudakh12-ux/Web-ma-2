"use client";
/**
 * The interactive counter screen. It moves between these steps:
 *
 *   locked  -> staff enter the café PIN once
 *   phone   -> customer types their phone number
 *   signup  -> (new customers only) name, birthday, privacy, SMS opt-in
 *   result  -> streak, progress, rewards ready, savings messages
 *   notice  -> "already checked in" / errors
 *
 * After a result it automatically goes back to the phone screen so the next
 * customer can use it.
 */
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { CafeLogo } from "@/components/CafeLogo";
import { Keypad, formatTyped } from "@/components/Keypad";
import { ProgressBar } from "@/components/ProgressBar";
import type { CheckInResult, CheckInView } from "@/lib/checkin/service";
import { lockCounter, resetDemo, submitPhone, submitRedeem, submitSignUp, unlockCounter } from "./actions";

type CafeInfo = {
  name: string;
  logoUrl: string | null;
  tagline: string | null;
  isDemo: boolean;
  privacyNotice: string;
  smsConsent: string;
  leaderboardPrize: string | null;
};

type Step =
  | { kind: "locked" }
  | { kind: "phone" }
  | { kind: "signup"; phone: string }
  | { kind: "result"; view: CheckInView }
  | { kind: "notice"; message: string; tone: "info" | "error" };

const RESULT_TIMEOUT_MS = 45_000;
const SIGNUP_TIMEOUT_MS = 120_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type Leader = { rank: number; firstName: string; visits: number };

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
  showcase: { display: string; firstName: string; story: string }[];
  leaderboard: Leader[];
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(unlocked ? { kind: "phone" } : { kind: "locked" });
  const [digits, setDigits] = useState("");
  const [pending, startTransition] = useTransition();
  const [touch, setTouch] = useState(0); // bumps on any interaction to restart the idle timer

  // Idle reset: go back to the phone screen after a while.
  useEffect(() => {
    const timeout =
      step.kind === "result" || step.kind === "notice" ? RESULT_TIMEOUT_MS : step.kind === "signup" ? SIGNUP_TIMEOUT_MS : null;
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
        const message = e instanceof Error ? e.message : "Something went wrong";
        if (message.includes("locked")) setStep({ kind: "locked" });
        else setStep({ kind: "notice", message: "Something went wrong. Please try again.", tone: "error" });
      }
    });
  }

  const home = () => {
    setDigits("");
    setStep({ kind: "phone" });
    router.refresh(); // pick up the latest leaderboard
  };

  return (
    <main className="flex flex-1 flex-col px-4 py-6 sm:px-8" onPointerDown={() => setTouch((n) => n + 1)}>
      <header className="flex items-center justify-between gap-4">
        <button type="button" onClick={home} aria-label="Start over">
          <CafeLogo name={cafe.name} logoUrl={cafe.logoUrl} size="md" />
        </button>
        <div className="flex items-center gap-3 text-sm text-brand-muted">
          {cafe.isDemo && <span className="rounded-full bg-brand-primary/20 px-3 py-1 text-brand-primary">Demo mode</span>}
          {step.kind !== "locked" && !cafe.isDemo && (
            <button
              type="button"
              className="opacity-40 hover:opacity-100"
              onClick={() => run(() => lockCounter(siteKey), () => setStep({ kind: "locked" }))}
            >
              Lock
            </button>
          )}
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center py-6">
        {step.kind === "locked" && <Unlock siteKey={siteKey} onUnlocked={home} />}

        {step.kind === "phone" && (
          <PhoneStep
            digits={digits}
            setDigits={setDigits}
            pending={pending}
            tagline={cafe.tagline}
            leaderboard={leaderboard}
            prize={cafe.leaderboardPrize}
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
            <p className={`text-2xl ${step.tone === "error" ? "text-red-300" : "text-brand-text"}`}>{step.message}</p>
            <button type="button" onClick={home} className="mt-8 rounded-2xl bg-brand-primary px-8 py-4 text-xl font-semibold text-brand-on-primary">
              OK
            </button>
          </div>
        )}
      </div>

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
      {error && <p className="mb-4 text-red-300">{error}</p>}
      <Keypad
        onDigit={(d) => {
          const next = (pin + d).slice(0, 8);
          setPin(next);
          setError(null);
        }}
        onBackspace={() => setPin(pin.slice(0, -1))}
        onClear={() => setPin("")}
      />
      <button
        type="button"
        disabled={pin.length < 4 || pending}
        onClick={() => submit(pin)}
        className="mt-4 w-full rounded-2xl bg-brand-primary py-4 text-xl font-semibold text-brand-on-primary disabled:opacity-40"
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
}: {
  digits: string;
  setDigits: (d: string) => void;
  pending: boolean;
  tagline: string | null;
  leaderboard: Leader[];
  prize: string | null;
  onSubmit: () => void;
}) {
  const ready = digits.length === 10;
  return (
    <div className="grid items-center gap-8 md:grid-cols-2">
      <div className="text-center md:text-left">
        <h1 className="text-4xl font-bold leading-tight sm:text-5xl">Keep your streak going</h1>
        <p className="mt-3 text-xl text-brand-muted">{tagline ?? "Enter your phone number to check in."}</p>
        <p
          className="mt-8 min-h-[3.5rem] rounded-2xl bg-brand-surface px-6 py-3 text-center font-mono text-3xl tracking-wide sm:text-4xl"
          aria-live="polite"
        >
          {digits ? formatTyped(digits) : <span className="text-brand-muted/50">(___) ___-____</span>}
        </p>
        <MiniLeaderboard entries={leaderboard.slice(0, 5)} prize={prize} />
      </div>
      <div className="mx-auto w-full max-w-sm">
        <Keypad
          onDigit={(d) => setDigits((digits + d).slice(0, 10))}
          onBackspace={() => setDigits(digits.slice(0, -1))}
          onClear={() => setDigits("")}
        />
        <button
          type="button"
          disabled={!ready || pending}
          onClick={onSubmit}
          className="mt-4 w-full rounded-2xl bg-brand-primary py-5 text-2xl font-bold text-brand-on-primary shadow-lg disabled:opacity-40"
        >
          {pending ? "Checking in…" : "Check in"}
        </button>
      </div>
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
};

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
            <span className="text-brand-muted">{e.visits} {e.visits === 1 ? "visit" : "visits"}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

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
  });
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => nameRef.current?.focus(), []);
  const canSubmit = f.firstName.trim().length > 0 && f.privacyAccepted && !pending;
  const set = <K extends keyof SignUpForm>(k: K, v: SignUpForm[K]) => setF((x) => ({ ...x, [k]: v }));

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

      <label className="block">
        <span className="text-lg">First name or nickname</span>
        <input
          ref={nameRef}
          value={f.firstName}
          onChange={(e) => set("firstName", e.target.value)}
          maxLength={24}
          autoComplete="off"
          className="mt-1 w-full rounded-xl bg-brand-surface px-4 py-4 text-2xl outline-none ring-brand-primary focus:ring-2"
          placeholder="e.g. Sara"
        />
      </label>

      <fieldset>
        <legend className="text-lg">
          Birthday <span className="text-brand-muted">(optional, for a free birthday drink)</span>
        </legend>
        <div className="mt-1 flex gap-3">
          <select
            value={f.birthdayMonth ?? ""}
            onChange={(e) => set("birthdayMonth", e.target.value ? Number(e.target.value) : null)}
            className="flex-1 rounded-xl bg-brand-surface px-4 py-4 text-xl"
            aria-label="Birthday month"
          >
            <option value="">Month</option>
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
          <select
            value={f.birthdayDay ?? ""}
            onChange={(e) => set("birthdayDay", e.target.value ? Number(e.target.value) : null)}
            className="w-32 rounded-xl bg-brand-surface px-4 py-4 text-xl"
            aria-label="Birthday day"
          >
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
        <button type="button" onClick={onCancel} className="rounded-2xl bg-brand-surface px-6 py-4 text-xl">
          Cancel
        </button>
        <button
          type="submit"
          disabled={!canSubmit}
          className="flex-1 rounded-2xl bg-brand-primary py-4 text-2xl font-bold text-brand-on-primary disabled:opacity-40"
        >
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

  const headline = view.isNewMember
    ? `Welcome, ${view.firstName}! You're in.`
    : view.leveledUpTo
      ? `${view.firstName}, you reached ${view.leveledUpTo}!`
      : `Thanks, ${view.firstName}!`;

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <section className="space-y-5">
        <h1 className="text-4xl font-bold leading-tight">{headline}</h1>
        <div className="flex flex-wrap gap-3 text-lg">
          <span className="rounded-full bg-brand-primary px-4 py-1 font-semibold text-brand-on-primary">{view.levelName}</span>
          <span className="rounded-full bg-brand-surface px-4 py-1">
            🔥 {view.streakWeeks}-week streak
          </span>
          <span className="rounded-full bg-brand-surface px-4 py-1">{view.streakVisits} streak visits</span>
        </div>
        {view.levelPerk && <p className="text-xl text-brand-primary">✨ {view.levelPerk[0].toUpperCase() + view.levelPerk.slice(1)}. Ask the cashier!</p>}
        <ProgressBar fraction={view.progress.fraction} label={view.progress.line} />
        {view.lines.events.map((l) => (
          <p key={l} className="rounded-xl bg-brand-surface p-3 text-brand-muted">
            {l}
          </p>
        ))}
        {view.lines.risk && <p className="rounded-xl border border-brand-primary/50 p-3">{view.lines.risk}</p>}
      </section>

      <section className="space-y-4">
        <div className="rounded-2xl bg-brand-surface p-5">
          {view.lines.savedToday && <p className="text-3xl font-bold text-brand-primary">{view.lines.savedToday}</p>}
          <p className="mt-1 text-xl">{view.lines.nextTime}</p>
          <p className="mt-3 text-brand-muted">{view.lines.totalSaved}</p>
        </div>

        {view.rewards.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Rewards ready</h2>
            {view.rewards.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 rounded-2xl border border-brand-primary/40 p-4">
                <div>
                  <p className="text-xl font-semibold">
                    {r.isNew && <span className="mr-2 text-brand-primary">NEW</span>}
                    {r.name}
                  </p>
                  <p className="text-brand-muted">{r.valueLabel} value</p>
                </div>
                <button
                  type="button"
                  onClick={() => setConfirming(r)}
                  className="rounded-xl bg-brand-primary px-5 py-3 text-lg font-semibold text-brand-on-primary"
                >
                  Use now
                </button>
              </div>
            ))}
            <p className="text-sm text-brand-muted">Not using it today? It stays saved for your next visit.</p>
          </div>
        )}
        {error && <p className="text-red-300">{error}</p>}

        {view.qrSvg && (
          <div className="flex items-center gap-4 rounded-2xl bg-brand-surface p-4">
            <div data-url={view.personalUrl} className="h-28 w-28 shrink-0 overflow-hidden rounded-lg bg-white p-1" dangerouslySetInnerHTML={{ __html: view.qrSvg }} />
            <p className="text-brand-muted">
              <span className="block text-lg font-semibold text-brand-text">Your rewards page</span>
              Scan with your phone camera to see your streak, savings and the leaderboard anytime.
            </p>
          </div>
        )}

        <button type="button" onClick={onDone} className="w-full rounded-2xl bg-brand-text/10 py-4 text-xl">
          Done
        </button>
      </section>

      {confirming && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-3xl bg-brand-surface p-6 text-center">
            <p className="text-sm uppercase tracking-widest text-brand-muted">For the cashier</p>
            <p className="mt-3 text-2xl font-bold">
              {confirming.name} ({confirming.valueLabel})
            </p>
            <p className="mt-3 text-lg">
              In Toast, apply the <strong className="text-brand-primary">“Streak Reward”</strong> discount for{" "}
              <strong>{confirming.valueLabel}</strong>, then tap Applied.
            </p>
            <div className="mt-6 flex gap-3">
              <button type="button" onClick={() => setConfirming(null)} className="flex-1 rounded-2xl bg-brand-text/10 py-4 text-lg">
                Cancel
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => redeem(confirming.id)}
                className="flex-1 rounded-2xl bg-brand-primary py-4 text-lg font-bold text-brand-on-primary disabled:opacity-50"
              >
                {pending ? "Saving…" : "Applied"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DemoPanel({
  showcase,
  onPick,
  onReset,
  pending,
}: {
  showcase: { display: string; firstName: string; story: string }[];
  onPick: (display: string) => void;
  onReset: () => void;
  pending: boolean;
}) {
  return (
    <aside className="mx-auto mt-4 w-full max-w-5xl rounded-2xl border border-dashed border-brand-muted/40 p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="font-semibold">Pitch shortcuts: tap a demo customer, then Check in</p>
        <button type="button" disabled={pending} onClick={onReset} className="text-sm text-brand-muted underline">
          Reset demo data
        </button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {showcase.map((c) => (
          <button key={c.display} type="button" onClick={() => onPick(c.display)} className="rounded-xl bg-brand-surface p-3 text-left">
            <span className="font-semibold">{c.firstName}</span> <span className="font-mono text-sm text-brand-muted">{c.display}</span>
            <span className="block text-sm text-brand-muted">{c.story}</span>
          </button>
        ))}
        <div className="rounded-xl bg-brand-surface p-3 text-sm text-brand-muted">
          <span className="font-semibold text-brand-text">New customer:</span> type any other number, e.g. (313) 555-0199, to see sign-up.
        </div>
      </div>
    </aside>
  );
}
