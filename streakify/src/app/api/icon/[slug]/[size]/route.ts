/** Café app icon as PNG (home-screen icon, Wallet, Google pass logo). /api/icon/sanaacafe/180 */
import { connection } from "next/server";
import { getRepo } from "@/lib/data";
import { cafeIconPng } from "@/lib/images";
import { requestOrigin } from "@/lib/urls";

export async function GET(req: Request, ctx: RouteContext<"/api/icon/[slug]/[size]">) {
  await connection();
  const { slug, size } = await ctx.params;
  const px = Math.min(1024, Math.max(16, Number(size) || 192));
  const cafe = await getRepo().getCafeBySlug(slug);
  if (!cafe) return new Response("Not found", { status: 404 });
  const png = await cafeIconPng(cafe, px, requestOrigin(req));
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600" } });
}
