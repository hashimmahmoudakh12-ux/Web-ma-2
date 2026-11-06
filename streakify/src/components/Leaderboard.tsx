/** Monthly leaderboard list (first names only, never phone numbers). */
export function Leaderboard({
  entries,
  highlightId,
  prize,
  monthLabel,
}: {
  entries: { rank: number; customerId?: string; firstName: string; visits: number }[];
  highlightId?: string;
  prize: string | null;
  monthLabel: string;
}) {
  return (
    <div className="rounded-2xl bg-brand-surface p-5">
      <h2 className="text-lg font-semibold">🏆 {monthLabel} leaderboard</h2>
      {prize && <p className="text-sm text-brand-muted">#1 at the end of the month wins: {prize}</p>}
      {entries.length === 0 ? (
        <p className="mt-3 text-brand-muted">No one on the board yet this month. Be the first!</p>
      ) : (
        <ol className="mt-3 space-y-1.5">
          {entries.map((e) => (
            <li
              key={e.rank}
              className={`flex items-center justify-between rounded-lg px-2 py-1 ${e.customerId && e.customerId === highlightId ? "bg-brand-primary/20" : ""}`}
            >
              <span>
                <span className="inline-block w-7 font-semibold text-brand-primary">{e.rank}.</span>
                {e.firstName}
                {e.customerId && e.customerId === highlightId && <span className="ml-2 text-xs text-brand-primary">YOU</span>}
              </span>
              <span className="text-brand-muted">{e.visits} {e.visits === 1 ? "visit" : "visits"}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
