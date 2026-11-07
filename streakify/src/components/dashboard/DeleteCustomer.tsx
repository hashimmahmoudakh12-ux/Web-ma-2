"use client";
import { useState, useTransition } from "react";
import type { SaveResult } from "./SettingsForm";

/** Privacy requests: "please delete my data". */
export function DeleteCustomer({ onDelete }: { onDelete: (phone: string) => Promise<SaveResult> }) {
  const [phone, setPhone] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="rounded-2xl bg-brand-surface p-5">
      <h2 className="font-semibold">Delete a customer&apos;s data</h2>
      <p className="text-sm text-brand-muted">For privacy requests. Removes their account, visits and rewards for good.</p>
      <div className="mt-3 flex gap-2">
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone number" className="flex-1 rounded-lg bg-brand-bg px-3 py-2" />
        <button
          disabled={pending || !phone}
          onClick={() => {
            if (!confirm("Delete this customer permanently?")) return;
            start(async () => setMsg((await onDelete(phone)).message));
          }}
          className="rounded-lg bg-red-500/80 px-4 py-2 font-semibold text-white disabled:opacity-40"
        >
          Delete
        </button>
      </div>
      {msg && <p className="mt-2 text-sm">{msg}</p>}
    </div>
  );
}
