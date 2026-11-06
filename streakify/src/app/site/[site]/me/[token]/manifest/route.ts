/**
 * Web app manifest for the customer's home-screen app. It's per customer so
 * the installed app opens straight to THEIR card.
 */
import { connection } from "next/server";
import { getRepo } from "@/lib/data";
import { resolveCafe } from "@/lib/tenant";

export async function GET(req: Request, ctx: RouteContext<"/site/[site]/me/[token]/manifest">) {
  await connection();
  const { site, token } = await ctx.params;
  const cafe = await resolveCafe(site);
  const customer = cafe ? await getRepo().getCustomerByToken(cafe.id, token) : null;
  if (!cafe || !customer) return new Response("Not found", { status: 404 });
  const base = req.headers.get("x-cafe-base") ?? "";
  const start = `${base}/me/${token}`;
  return new Response(
    JSON.stringify({
      name: `${cafe.name} Rewards`,
      short_name: cafe.name,
      description: `Your ${cafe.name} streak, rewards and badges`,
      id: start,
      start_url: start,
      scope: start,
      display: "standalone",
      orientation: "portrait",
      background_color: cafe.brand.colors.background,
      theme_color: cafe.brand.colors.background,
      icons: [
        { src: `/api/icon/${cafe.slug}/192`, sizes: "192x192", type: "image/png" },
        { src: `/api/icon/${cafe.slug}/512`, sizes: "512x512", type: "image/png" },
        { src: `/api/icon/${cafe.slug}/512`, sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    }),
    { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "private, max-age=300" } },
  );
}
