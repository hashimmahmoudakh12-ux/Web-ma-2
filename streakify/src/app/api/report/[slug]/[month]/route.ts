/**
 * Download a café's monthly PDF: /api/report/sanaacafe/2026-11
 * Allowed for you (admin, after 2FA) and for that café's own owners.
 */
import { connection } from "next/server";
import { currentSession, getAuth } from "@/lib/auth";
import { getRepo } from "@/lib/data";
import { renderMonthlyReport } from "@/lib/report";

export async function GET(_req: Request, ctx: RouteContext<"/api/report/[slug]/[month]">) {
  await connection();
  const { slug, month } = await ctx.params;
  if (!/^\d{4}-\d{2}$/.test(month)) return new Response("Bad month", { status: 400 });
  const cafe = await getRepo().getCafeBySlug(slug);
  if (!cafe) return new Response("Not found", { status: 404 });
  const s = await currentSession();
  const isAdmin = s?.user.role === "admin" && (!getAuth().supportsMfa || s.aal === "aal2");
  const isOwner = s?.user.role === "owner" && s.user.cafeId === cafe.id;
  if (!isAdmin && !isOwner) return new Response("Not allowed", { status: 403 });
  // Owners' data is read through their own (Row Level Security) access.
  const repo = isOwner ? await getAuth().scopedRepo() : getRepo();
  const pdf = await renderMonthlyReport(cafe, month, repo);
  return new Response(Buffer.from(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${slug}-${month}-report.pdf"`, "Cache-Control": "private, no-store" },
  });
}
