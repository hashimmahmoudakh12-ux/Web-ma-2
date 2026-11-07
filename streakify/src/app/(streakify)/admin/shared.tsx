/** Bits shared by the admin pages. */
import type { AuditEntry, Cafe } from "@/lib/data";

export const ADMIN_NAV = [
  { href: "/admin", label: "Cafés" },
  { href: "/admin/cafes/new", label: "Add café" },
  { href: "/admin/activity", label: "Activity log" },
  { href: "/admin/security", label: "Security" },
];

const STATUS_STYLE: Record<Cafe["status"], string> = {
  trial: "bg-sky-500/15 text-sky-600 dark:text-sky-300",
  active: "bg-green-500/15 text-green-600 dark:text-green-300",
  paused: "bg-amber-500/15 text-amber-600 dark:text-amber-300",
  cancelled: "bg-red-500/15 text-red-600 dark:text-red-300",
};

export function StatusChip({ status }: { status: Cafe["status"] }) {
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${STATUS_STYLE[status]}`}>{status}</span>;
}


export function AuditTable({ rows, cafeNames }: { rows: AuditEntry[]; cafeNames: Map<string, string> }) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="text-brand-muted">
          <tr className="border-b border-brand-text/10">
            <th className="p-3 font-normal">When</th>
            <th className="p-3 font-normal">Who</th>
            <th className="p-3 font-normal">What</th>
            <th className="p-3 font-normal">Café</th>
            <th className="p-3 font-normal">Details</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td className="p-3 text-brand-muted" colSpan={5}>
                Nothing yet.
              </td>
            </tr>
          )}
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-brand-text/5 last:border-0">
              <td className="whitespace-nowrap p-3 tabular-nums text-brand-muted">{r.at ? new Date(r.at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : ""}</td>
              <td className="p-3">
                {r.actorEmail ?? "system"} {r.actorRole && <span className="text-xs text-brand-muted">({r.actorRole})</span>}
              </td>
              <td className={`p-3 font-mono text-xs ${r.action.includes("failed") ? "text-red-600 dark:text-red-400" : ""}`}>{r.action}</td>
              <td className="p-3">{r.cafeId ? (cafeNames.get(r.cafeId) ?? "—") : "—"}</td>
              <td className="max-w-xs truncate p-3 font-mono text-xs text-brand-muted" title={JSON.stringify(r.details)}>
                {r.details && Object.keys(r.details).length ? JSON.stringify(r.details) : ""} {r.ip ? `· ${r.ip}` : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

