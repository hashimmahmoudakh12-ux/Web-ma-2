/** What both Wallet passes (Apple + Google) show for a customer. */
import "server-only";
import { getRepo, type Cafe, type Customer } from "../data";
import { formatMoney } from "../money";
import { progressFor } from "../streak/engine";
import { localDate } from "../time";

export type PassData = {
  firstName: string;
  level: string;
  levelIcon: string;
  xp: number;
  streak: string;
  saved: string;
  rewards: string; // "Free pastry, Free drink" or "None yet"
  nextUp: string;
  qr: string;
};

/** The QR on the pass. The counter tablet's scanner understands this format. */
export const passBarcode = (c: Customer) => `STRK:${c.publicToken}`;

export async function passData(cafe: Cafe, c: Customer): Promise<PassData> {
  const repo = getRepo();
  const [rewards, savings] = await Promise.all([repo.listAvailableRewards(cafe.id, c.id), repo.savings(cafe.id, c.id, localDate(new Date(), cafe.timezone))]);
  const p = progressFor(c.xp, cafe.program);
  return {
    firstName: c.firstName,
    level: p.level.name,
    levelIcon: p.level.icon,
    xp: c.xp,
    streak: `🔥 ${c.streakWeeks} ${c.streakWeeks === 1 ? "week" : "weeks"}`,
    saved: formatMoney(savings.totalCents, cafe.currency),
    rewards: rewards.length ? rewards.map((r) => r.name).join(", ") : "None yet",
    nextUp: p.next ? `${p.xpToNext} XP to ${p.next.name}` : "Top level reached",
    qr: passBarcode(c),
  };
}
