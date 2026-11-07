/**
 * Runs before every page request (Next.js "proxy", formerly "middleware").
 * It reads the host name and quietly rewrites the URL to our internal
 * /site/<key>/... pages, so one codebase serves every café.
 * The browser still shows the pretty URL.
 */
import { createServerClient } from "@supabase/ssr";
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

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const SB_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
const AUTH_PATHS = /^\/(login|admin|dashboard|auth)(\/|$)/;

/** Keeps Supabase login sessions fresh (refreshes the token cookie when needed). */
async function withFreshSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });
  if (!SB_URL || !SB_ANON) return response;
  const sb = createServerClient(SB_URL, SB_ANON, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  await sb.auth.getUser();
  return response;
}

/** streakify.com (or the same host on preview URLs) */
function rootOrigin(request: NextRequest) {
  if (ROOT_HOST === "localhost" || ROOT_HOST.endsWith(".vercel.app")) return request.nextUrl.origin;
  return `${request.nextUrl.protocol}//${ROOT}`;
}

export async function proxy(request: NextRequest) {
  const url = request.nextUrl.clone();
  const host = request.headers.get("host") ?? "";
  const headers = new Headers(request.headers);

  // Nobody may hit the internal /site path directly.
  if (url.pathname.startsWith("/site/")) return new NextResponse(null, { status: 404 });

  // Owners now sign in at streakify.com/login and use /dashboard.
  if (/^(\/c\/[a-z0-9-]+)?\/owner(\/|$)/.test(url.pathname) && (url.pathname.startsWith("/c/") || siteKeyFor(host))) {
    return NextResponse.redirect(`${rootOrigin(request)}/dashboard`);
  }

  // Path-based fallback: /c/<slug>/counter works on any host (preview URLs).
  const match = url.pathname.match(/^\/c\/([a-z0-9-]+)(\/.*)?$/);
  if (match) {
    headers.set("x-cafe-base", `/c/${match[1]}`);
    url.pathname = `/site/s~${match[1]}${match[2] ?? ""}`;
    return NextResponse.rewrite(url, { request: { headers } });
  }

  const key = siteKeyFor(host);
  if (!key) return AUTH_PATHS.test(url.pathname) ? withFreshSession(request) : NextResponse.next();
  headers.set("x-cafe-base", "");
  url.pathname = `/site/${key}${url.pathname === "/" ? "" : url.pathname}`;
  return NextResponse.rewrite(url, { request: { headers } });
}

export const config = {
  // Skip Next.js internals and static files (anything with a dot, like logo.png).
  matcher: ["/((?!_next/|api/|favicon.ico|.*\\..*).*)"],
};
