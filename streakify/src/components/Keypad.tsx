"use client";
/** Big number pad for the tablet. */
export function Keypad({ onDigit, onBackspace, onClear }: { onDigit: (d: string) => void; onBackspace: () => void; onClear: () => void }) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"];
  return (
    <div className="grid grid-cols-3 gap-3">
      {keys.map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => (k === "back" ? onBackspace() : k === "clear" ? onClear() : onDigit(k))}
          className="h-16 rounded-2xl bg-brand-surface text-2xl font-semibold text-brand-text shadow active:scale-95 active:bg-brand-primary active:text-brand-on-primary sm:h-20 sm:text-3xl"
          aria-label={k === "back" ? "Delete" : k === "clear" ? "Clear" : k}
        >
          {k === "back" ? "⌫" : k === "clear" ? <span className="text-base text-brand-muted">Clear</span> : k}
        </button>
      ))}
    </div>
  );
}

/** "3135550101" -> "(313) 555-0101" while typing */
export function formatTyped(digits: string): string {
  const d = digits.slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}
