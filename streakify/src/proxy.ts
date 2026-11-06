/**
 * Runs before every page request (Next.js "proxy", formerly "middleware").
 * It reads the host name and quietly rewrites the URL to our internal
 * /site/<key>/... pages, so one codebase serves every café.
 * The browser still shows the pretty URL.
 */
import { NextResponse, type NextRequest } from "next/server";

const ROOT = (process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000").toLowerCase();
const ROOT_HOST = ROOT.split(":")[0];

function siteKeyFor(host: string): string | null {
  const hostname = host.split(":")[0].toLowerCase();
  if (hostname === ROOT_HOST || hostname === `www.${ROOT_HOST}`) return null; // Streakify itself
  if (ROOT_HOST.endsWith(".vercel.app")) return null; // no wildcard subdomains on vercel.app
  if (hostname.endsWith(`.${ROOT_HOST}`)) {
    const sub = hostname.slice(0, -(ROOT_HOST.length + 1));
    return sub.includes(".") ? null : `s~${sub}`;
  }
  if (hostname.endsWith(".vercel.app") || hostname === "127.0.0.1") return null; // previews
  return `h~${hostname}`; // a café's custom domain
}

export function proxy(request: NextRequest) {
  const url = request.nextUrl.clone();
  const host = request.headers.get("host") ?? "";
  const headers = new Headers(request.headers);

  // Nobody may hit the internal /site path directly.
  if (url.pathname.startsWith("/site/")) return new NextResponse(null, { status: 404 });

  // Path-based fallback: /c/<slug>/counter works on any host (preview URLs).
  const match = url.pathname.match(/^\/c\/([a-z0-9-]+)(\/.*)?$/);
  if (match) {
    headers.set("x-cafe-base", `/c/${match[1]}`);
    url.pathname = `/site/s~${match[1]}${match[2] ?? ""}`;
    return NextResponse.rewrite(url, { request: { headers } });
  }

  const key = siteKeyFor(host);
  if (!key) return NextResponse.next();
  headers.set("x-cafe-base", "");
  url.pathname = `/site/${key}${url.pathname === "/" ? "" : url.pathname}`;
  return NextResponse.rewrite(url, { request: { headers } });
}

export const config = {
  // Skip Next.js internals and static files (anything with a dot, like logo.png).
  matcher: ["/((?!_next/|api/|favicon.ico|.*\\..*).*)"],
};
