/** "Add to Google Wallet": redirects to Google's save page with the signed card. */
import { connection } from "next/server";
import { getRepo } from "@/lib/data";
import { requestOrigin } from "@/lib/urls";
import { googleSaveUrl, googleWalletConfigured } from "@/lib/wallet/google";

export async function GET(req: Request, ctx: RouteContext<"/api/wallet/google/[slug]/[token]">) {
  await connection();
  if (!googleWalletConfigured()) return new Response("Google Wallet isn't set up yet.", { status: 503 });
  const { slug, token } = await ctx.params;
  const repo = getRepo();
  const cafe = await repo.getCafeBySlug(slug);
  const customer = cafe ? await repo.getCustomerByToken(cafe.id, token) : null;
  if (!cafe || !customer) return new Response("Not found", { status: 404 });
  return Response.redirect(await googleSaveUrl(cafe, customer, requestOrigin(req)), 302);
}
