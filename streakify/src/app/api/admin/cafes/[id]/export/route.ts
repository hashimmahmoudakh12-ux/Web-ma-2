/** CSV export of a café's data (admin only, logged). ?type=customers|visits|rewards */
import { connection } from "next/server";
import { audit, currentSession, getAuth } from "@/lib/auth";
import { getRepo } from "@/lib/data";
import { levelIndexFor } from "@/lib/streak/engine";

const csv = (rows: (string | number | boolean | null)[][]) =>
  rows.map((r) => r.map((v) => (v === null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))).join(",")).join("\n");

export async function GET(req: Request, ctx: RouteContext<"/api/admin/cafes/[id]/export">) {
  await connection();
  const s = await currentSession();
  if (!s || s.user.role !== "admin" || (getAuth().supportsMfa && s.aal !== "aal2")) return new Response("Not allowed", { status: 403 });
  const { id } = await ctx.params;
  const repo = getRepo();
  const cafe = await repo.getCafeById(id);
  if (!cafe) return new Response("Not found", { status: 404 });
  const type = new URL(req.url).searchParams.get("type") ?? "customers";
  const customers = await repo.listCustomers(cafe.id);
  const names = new Map(customers.map((c) => [c.id, c.firstName]));
  let body: string;
  if (type === "visits") {
    const v = await repo.listVisits(cafe.id, "2000-01-01", "2999-12-31");
    body = csv([["visit_id", "customer", "date", "time_utc", "verified_by_pos"], ...v.map((x) => [x.id, names.get(x.customerId) ?? "", x.localDate, x.createdAt, x.verified])]);
  } else if (type === "rewards") {
    const r = await repo.listRewardActivity(cafe.id, "2000-01-01", "2999-12-31");
    body = csv([["reward_id", "customer", "type", "name", "value_cents", "cost_cents", "status", "earned", "redeemed"], ...r.map((x) => [x.id, names.get(x.customerId) ?? "", x.kind, x.name, x.valueCents, x.costCents, x.status, x.earnedLocalDate, x.redeemedLocalDate])]);
  } else {
    body = csv([
      ["customer_id", "first_name", "phone", "joined", "total_visits", "xp", "level", "streak_weeks", "sms_opt_in", "leaderboard_opt_in"],
      ...customers.map((c) => [c.id, c.firstName, c.phone, c.createdAt.slice(0, 10), c.totalVisits, c.xp, cafe.program.levels[levelIndexFor(c.xp, cafe.program.levels)].name, c.streakWeeks, c.smsOptIn, c.leaderboardOptIn]),
    ]);
  }
  await audit("cafe.export", { session: s, cafeId: cafe.id, details: { type } });
  return new Response(body, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${cafe.slug}-${type}.csv"`, "Cache-Control": "no-store" },
  });
}
