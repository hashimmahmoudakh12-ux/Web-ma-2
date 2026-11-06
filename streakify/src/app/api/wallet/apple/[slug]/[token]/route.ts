/** "Add to Apple Wallet" download: /api/wallet/apple/<café>/<customer token> */
import { connection } from "next/server";
import { getRepo } from "@/lib/data";
import { requestOrigin } from "@/lib/urls";
import { appleWalletConfigured, buildApplePass } from "@/lib/wallet/apple";

export async function GET(req: Request, ctx: RouteContext<"/api/wallet/apple/[slug]/[token]">) {
  await connection();
  if (!appleWalletConfigured()) return new Response("Apple Wallet isn't set up yet.", { status: 503 });
  const { slug, token } = await ctx.params;
  const repo = getRepo();
  const cafe = await repo.getCafeBySlug(slug);
  const customer = cafe ? await repo.getCustomerByToken(cafe.id, token) : null;
  if (!cafe || !customer) return new Response("Not found", { status: 404 });
  const pass = await buildApplePass(cafe, customer, requestOrigin(req));
  return new Response(new Uint8Array(pass), {
    headers: {
      "Content-Type": "application/vnd.apple.pkpass",
      "Content-Disposition": `attachment; filename="${slug}.pkpass"`,
      "Cache-Control": "no-store",
    },
  });
}
