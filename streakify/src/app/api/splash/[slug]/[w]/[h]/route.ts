/** iPhone launch screen in the café's colors. /api/splash/sanaacafe/1179/2556 */
import { connection } from "next/server";
import { getRepo } from "@/lib/data";
import { cafeSplashPng } from "@/lib/images";
import { requestOrigin } from "@/lib/urls";

export async function GET(req: Request, ctx: RouteContext<"/api/splash/[slug]/[w]/[h]">) {
  await connection();
  const { slug, w, h } = await ctx.params;
  const width = Math.min(3000, Math.max(100, Number(w) || 1179));
  const height = Math.min(3000, Math.max(100, Number(h) || 2556));
  const cafe = await getRepo().getCafeBySlug(slug);
  if (!cafe) return new Response("Not found", { status: 404 });
  const png = await cafeSplashPng(cafe, width, height, requestOrigin(req));
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600" } });
}
