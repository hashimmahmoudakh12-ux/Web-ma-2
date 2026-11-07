"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { StreakifyMark } from "@/components/shell/StreakifyMark";
import { forgotPasswordAction, signInAction, verifyMfaAction } from "../auth-actions";

const field =
  "w-full rounded-xl border border-brand-text/10 bg-brand-bg px-4 py-3 text-[17px] outline-none transition focus:border-brand-primary focus:ring-4 focus:ring-brand-primary/20";

export function LoginCard({ initialStep, demoMode }: { initialStep: "password" | "mfa"; demoMode: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState<"password" | "mfa" | "forgot" | "sent">(initialStep);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const go = (to?: string) => {
    router.replace(to ?? "/");
    router.refresh();
  };

  return (
    <div className="card animate-pop w-full max-w-sm p-8">
      <div className="mb-6 flex flex-col items-center text-center">
        <StreakifyMark size={52} />
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">
          {step === "mfa" ? "Two-factor check" : step === "forgot" || step === "sent" ? "Reset password" : "Sign in to Streakify"}
        </h1>
        <p className="mt-1 text-sm text-brand-muted">
          {step === "mfa" ? "Enter the 6-digit code from your authenticator app." : step === "forgot" ? "We'll email you a link to set a new password." : step === "sent" ? "" : "For café owners and the Streakify team."}
        </p>
      </div>

      {step === "password" && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setMsg(null);
            start(async () => {
              const r = await signInAction(email, password);
              if (r.step === "mfa") {
                setStep("mfa");
                setMsg(null);
              } else if (r.step === "done") go(r.to);
              else setMsg(r.message ?? "Couldn't sign in.");
            });
          }}
        >
          <input className={field} type="email" autoComplete="username" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          <input className={field} type="password" autoComplete="current-password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          {msg && <p className="text-sm text-red-500">{msg}</p>}
          <button disabled={pending} className="pressable w-full rounded-xl bg-brand-primary py-3 text-[17px] font-semibold text-brand-on-primary disabled:opacity-60">
            {pending ? "Signing in…" : "Sign in"}
          </button>
          <button type="button" onClick={() => (setStep("forgot"), setMsg(null))} className="w-full pt-1 text-sm text-brand-primary">
            Forgot password?
          </button>
        </form>
      )}

      {step === "mfa" && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await verifyMfaAction(code);
              if (r.step === "done") go(r.to);
              else if (r.step === "password") {
                setStep("password");
                setMsg(r.message ?? null);
              } else setMsg(r.message ?? "That code didn't work.");
            });
          }}
        >
          <input
            className={`${field} text-center font-mono text-2xl tracking-[0.5em]`}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="••••••"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            autoFocus
          />
          {msg && <p className="text-sm text-red-500">{msg}</p>}
          <button disabled={pending || code.length !== 6} className="pressable w-full rounded-xl bg-brand-primary py-3 font-semibold text-brand-on-primary disabled:opacity-60">
            {pending ? "Checking…" : "Verify"}
          </button>
        </form>
      )}

      {step === "forgot" && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await forgotPasswordAction(email);
              setMsg(r.message);
              setStep("sent");
            });
          }}
        >
          <input className={field} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          <button disabled={pending} className="pressable w-full rounded-xl bg-brand-primary py-3 font-semibold text-brand-on-primary disabled:opacity-60">
            {pending ? "Sending…" : "Send reset link"}
          </button>
          <button type="button" onClick={() => setStep("password")} className="w-full pt-1 text-sm text-brand-muted">
            Back to sign in
          </button>
        </form>
      )}

      {step === "sent" && (
        <div className="space-y-4 text-center">
          <p className="text-sm">{msg}</p>
          <button type="button" onClick={() => (setStep("password"), setMsg(null))} className="text-sm text-brand-primary">
            Back to sign in
          </button>
        </div>
      )}

      {demoMode && <p className="mt-6 text-center text-xs text-brand-muted">Demo mode: accounts reset on restart. Connect Supabase for real logins and 2FA.</p>}
    </div>
  );
}
