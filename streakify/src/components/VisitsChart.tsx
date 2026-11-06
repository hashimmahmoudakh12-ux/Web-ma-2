/**
 * Visits per day: a single-series bar chart in the café's primary color.
 * Hover (or tap) a bar for the exact number; a table view is included for
 * screen readers and anyone who prefers numbers.
 */
import { formatShortDay } from "@/lib/time";

export function VisitsChart({ data }: { data: { date: string; count: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const ticks = [max, Math.round(max / 2), 0];
  return (
    <figure>
      <div className="flex gap-2">
        <div className="flex h-48 flex-col justify-between pb-5 text-right text-xs text-brand-muted">
          {ticks.map((t, i) => (
            <span key={i}>{t}</span>
          ))}
        </div>
        <div className="relative flex-1">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-[calc(100%-1.25rem)] border-b border-brand-text/20">
            <div className="h-1/2 border-b border-dashed border-brand-text/10" />
          </div>
          <div className="flex h-48 items-end gap-[2px] pb-5">
            {data.map((d, i) => (
              <div key={d.date} className="group relative flex h-full flex-1 flex-col justify-end" tabIndex={0} aria-label={`${formatShortDay(d.date)}: ${d.count} visits`}>
                <div className="rounded-t-[4px] bg-brand-primary transition-opacity group-hover:opacity-80" style={{ height: `${(d.count / max) * 100}%`, minHeight: d.count ? 2 : 0 }} />
                <span className="pointer-events-none absolute -top-8 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-brand-text px-2 py-1 text-xs text-brand-bg group-hover:block group-focus:block">
                  {formatShortDay(d.date)}: {d.count}
                </span>
                {(i === 0 || i === data.length - 1 || (i + 1) % 7 === 0) && (
                  <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] text-brand-muted">{formatShortDay(d.date)}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      <details className="mt-3 text-sm text-brand-muted">
        <summary className="cursor-pointer">Show as table</summary>
        <table className="mt-2 w-full">
          <tbody>
            {data.map((d) => (
              <tr key={d.date} className="border-t border-brand-text/10">
                <td className="py-1">{formatShortDay(d.date)}</td>
                <td className="py-1 text-right tabular-nums">{d.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
