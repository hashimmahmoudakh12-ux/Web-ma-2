/**
 * Where invite and password-reset links land. Logs the person in for this one
 * purpose, then sends them to set their password.
 */
import { connection } from "next/server";
import { audit, currentSession, getAuth } from "@/lib/auth";

export async function GET(request: Request) {
  await connection();
  const url = new URL(request.url);
  const ok = await getAuth().confirmLink(url.searchParams);
  if (!ok) return Response.redirect(new URL("/login?expired=1", url), 303);
  const s = await currentSession();
  await audit("auth.link_used", { session: s, cafeId: s?.user.cafeId, details: { type: url.searchParams.get("type") ?? "link" } });
  return Response.redirect(new URL("/auth/set-password", url), 303);
}
