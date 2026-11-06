"use client";
import { useActionState } from "react";

export function LoginForm({ action, cafeName }: { action: (prev: string | null, form: FormData) => Promise<string | null>; cafeName: string }) {
  const [error, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className="mx-auto w-full max-w-sm space-y-4 rounded-3xl bg-brand-surface p-6">
      <h1 className="text-2xl font-bold">{cafeName} owner login</h1>
      <input
        type="password"
        name="password"
        required
        autoFocus
        placeholder="Owner password"
        className="w-full rounded-xl bg-brand-bg px-4 py-3 outline-none ring-brand-primary focus:ring-2"
      />
      {error && <p className="text-red-300">{error}</p>}
      <button disabled={pending} className="w-full rounded-xl bg-brand-primary py-3 font-semibold text-brand-on-primary disabled:opacity-50">
        {pending ? "Checking…" : "Log in"}
      </button>
    </form>
  );
}
