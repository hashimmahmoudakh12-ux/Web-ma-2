/** The progress bar used everywhere: "2 more visits until your free pastry." */
export function ProgressBar({ fraction, label }: { fraction: number; label?: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, fraction)) * 100);
  return (
    <div>
      <div
        className="h-4 w-full overflow-hidden rounded-full bg-brand-text/10"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div className="h-full rounded-full bg-brand-primary transition-[width] duration-700" style={{ width: `${pct}%` }} />
      </div>
      {label && <p className="mt-2 text-brand-text/90">{label}</p>}
    </div>
  );
}
