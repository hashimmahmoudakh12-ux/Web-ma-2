/** The Streakify logo mark: a little flame inside a rounded square. */
export function StreakifyMark({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <defs>
        <linearGradient id="sk-g" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#ff4d2e" />
          <stop offset="100%" stopColor="#ffb547" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill="url(#sk-g)" />
      <path d="M20 8c2 6 8 9 8 16a8 8 0 0 1-16 0c0-4 2-6 3-9 1 3 2 4 3 4-1-4-1-8 2-11z" fill="#fff" opacity="0.95" />
    </svg>
  );
}

export function StreakifyWordmark() {
  return (
    <span className="flex items-center gap-2">
      <StreakifyMark size={28} />
      <span className="text-lg font-semibold tracking-tight">Streakify</span>
    </span>
  );
}
