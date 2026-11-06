"use client";
/** Live "2d 4h 13m" countdown to a moment in time. */
import { useEffect, useState } from "react";

function parts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60) };
}

export function Countdown({ to }: { to: string }) {
  const target = new Date(to).getTime();
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0); // start on the client only (avoids server/client mismatch)
    const t = setInterval(tick, 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, []);
  if (now === null) return <span>&nbsp;</span>;
  const { d, h, m } = parts(target - now);
  return (
    <span className="tabular-nums">
      {d > 0 && `${d}d `}
      {h}h {m}m
    </span>
  );
}
