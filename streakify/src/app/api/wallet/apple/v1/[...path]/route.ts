/**
 * Apple Wallet web service (Apple calls these, not people):
 *   POST   /v1/devices/:device/registrations/:passType/:serial   register for updates
 *   GET    /v1/devices/:device/registrations/:passType           which passes changed?
 *   DELETE /v1/devices/:device/registrations/:passType/:serial   unregister
 *   GET    /v1/passes/:passType/:serial                          latest pass
 *   POST   /v1/log                                               error logs from devices
 * Spec: developer.apple.com/documentation/walletpasses/adding-a-web-service-to-update-passes
 */
import { connection } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getRepo } from "@/lib/data";
import { requestOrigin } from "@/lib/urls";
import { appleWalletConfigured, buildApplePass, passAuthToken, passTypeId } from "@/lib/wallet/apple";

type Ctx = RouteContext<"/api/wallet/apple/v1/[...path]">;

function authorized(req: Request, serial: string) {
  const header = req.headers.get("authorization") ?? "";
  const given = Buffer.from(header.replace(/^ApplePass /, ""));
  const expected = Buffer.from(passAuthToken(serial));
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function POST(req: Request, ctx: Ctx) {
  await connection();
  const path = (await ctx.params).path;
  if (path[0] === "log") {
    const body = await req.json().catch(() => ({}));
    console.log("[wallet] device log", JSON.stringify(body).slice(0, 2000));
    return new Response(null, { status: 200 });
  }
  const [devices, deviceId, registrations, passType, serial] = path;
  if (devices !== "devices" || registrations !== "registrations" || !serial) return new Response(null, { status: 404 });
  if (!appleWalletConfigured() || passType !== passTypeId()) return new Response(null, { status: 404 });
  if (!authorized(req, serial)) return new Response(null, { status: 401 });
  const { pushToken } = (await req.json().catch(() => ({}))) as { pushToken?: string };
  if (!pushToken) return new Response(null, { status: 400 });
  const created = await getRepo().registerWalletDevice(deviceId, passType, serial, pushToken);
  return new Response(null, { status: created ? 201 : 200 });
}

export async function DELETE(req: Request, ctx: Ctx) {
  await connection();
  const [devices, deviceId, registrations, passType, serial] = (await ctx.params).path;
  if (devices !== "devices" || registrations !== "registrations" || !serial) return new Response(null, { status: 404 });
  if (!authorized(req, serial)) return new Response(null, { status: 401 });
  await getRepo().unregisterWalletDevice(deviceId, passType, serial);
  return new Response(null, { status: 200 });
}

export async function GET(req: Request, ctx: Ctx) {
  await connection();
  const path = (await ctx.params).path;
  const repo = getRepo();

  // Which of this device's passes changed since `passesUpdatedSince`?
  if (path[0] === "devices" && path[2] === "registrations" && path.length === 4) {
    const since = Number(new URL(req.url).searchParams.get("passesUpdatedSince") ?? 0);
    const serials = await repo.listWalletSerials(path[1], path[3]);
    const customers = (await Promise.all(serials.map((s) => repo.getCustomerById(s)))).filter((c) => c !== null);
    const changed = customers.filter((c) => new Date(c.updatedAt).getTime() > since);
    if (!changed.length) return new Response(null, { status: 204 });
    const lastUpdated = Math.max(...changed.map((c) => new Date(c.updatedAt).getTime()));
    return Response.json({ serialNumbers: changed.map((c) => c.id), lastUpdated: String(lastUpdated) });
  }

  // The latest version of one pass.
  if (path[0] === "passes" && path.length === 3) {
    const serial = path[2];
    if (!appleWalletConfigured() || path[1] !== passTypeId()) return new Response(null, { status: 404 });
    if (!authorized(req, serial)) return new Response(null, { status: 401 });
    const customer = await repo.getCustomerById(serial);
    if (!customer) return new Response(null, { status: 404 });
    const updated = new Date(customer.updatedAt);
    const ims = req.headers.get("if-modified-since");
    if (ims && new Date(ims).getTime() >= Math.floor(updated.getTime() / 1000) * 1000) return new Response(null, { status: 304 });
    const cafe = await repo.getCafeById(customer.cafeId);
    if (!cafe) return new Response(null, { status: 404 });
    const pass = await buildApplePass(cafe, customer, requestOrigin(req));
    return new Response(new Uint8Array(pass), {
      headers: { "Content-Type": "application/vnd.apple.pkpass", "Last-Modified": updated.toUTCString(), "Cache-Control": "no-store" },
    });
  }
  return new Response(null, { status: 404 });
}
