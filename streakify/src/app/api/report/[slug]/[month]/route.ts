/**
 * Download a café's monthly PDF: /api/report/sanaacafe/2026-11
 * Allowed for you (admin) and for that café's logged-in owner.
 */
import { connection } from "next/server";
import { getRepo } from "@/lib/data";
import { renderMonthlyReport } from "@/lib/report";
import { hasCafeAccess, isAdmin } from "@/lib/session";

export async function GET(_req: Request, ctx: RouteContext<"/api/report/[slug]/[month]">) {
  await connection();
  const { slug, month } = await ctx.params;
  if (!/^\d{4}-\d{2}$/.test(month)) return new Response("Bad month", { status: 400 });
  const cafe = await getRepo().getCafeBySlug(slug);
  if (!cafe) return new Response("Not found", { status: 404 });
  if (!(await isAdmin()) && !cafe.isDemo && !(await hasCafeAccess("owner", cafe))) {
    return new Response("Not allowed", { status: 403 });
  }
  const pdf = await renderMonthlyReport(cafe, month);
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${slug}-${month}-report.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
