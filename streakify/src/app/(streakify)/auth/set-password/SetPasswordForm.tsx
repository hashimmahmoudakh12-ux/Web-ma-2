"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { StreakifyMark } from "@/components/shell/StreakifyMark";
import { setPasswordAction } from "../../auth-actions";

const field = "w-full rounded-xl border border-brand-text/10 bg-brand-bg px-4 py-3 text-[17px] outline-none focus:border-brand-primary focus:ring-4 focus:ring-brand-primary/20";

export function SetPasswordForm({ email, role }: { email: string; role: "admin" | "owner" }) {
  const router = useRouter();
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="card w-full max-w-sm space-y-3 p-8"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await setPasswordAction(a, b);
          if (!r.ok) return setMsg(r.message ?? "Couldn't save.");
          router.replace(role === "admin" ? "/admin/security?setup=1" : "/dashboard");
        });
      }}
    >
      <div className="mb-4 flex flex-col items-center text-center">
        <StreakifyMark size={48} />
        <h1 className="mt-3 text-2xl font-semibold">Choose your password</h1>
        <p className="text-sm text-brand-muted">{email}</p>
      </div>
      <input className={field} type="password" autoComplete="new-password" placeholder="New password (10+ characters)" value={a} onChange={(e) => setA(e.target.value)} required />
      <input className={field} type="password" autoComplete="new-password" placeholder="Type it again" value={b} onChange={(e) => setB(e.target.value)} required />
      {msg && <p className="text-sm text-red-500">{msg}</p>}
      <button disabled={pending} className="pressable w-full rounded-xl bg-brand-primary py-3 font-semibold text-brand-on-primary disabled:opacity-60">
        {pending ? "Saving…" : "Save and continue"}
      </button>
    </form>
  );
}
