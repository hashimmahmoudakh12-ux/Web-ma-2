/**
 * Building links inside a café's site.
 * On sanaacafe.streakify.com links start at "/"; on the fallback form
 * (any-host/c/sanaacafe/...) they start at "/c/sanaacafe". The proxy tells
 * us which one via the "x-cafe-base" header.
 */
import "server-only";
import { headers } from "next/headers";

export async function cafeBase(): Promise<string> {
  return (await headers()).get("x-cafe-base") ?? "";
}

export async function absoluteCafeUrl(path: string): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.includes(".localhost") ? "http" : "https");
  return `${proto}://${host}${h.get("x-cafe-base") ?? ""}${path}`;
}

/** Public base URL for links in texts/emails (no request available in cron jobs). */
export function publicCafeUrl(cafe: { slug: string; customDomain: string | null }, path: string): string {
  if (cafe.customDomain) return `https://${cafe.customDomain}${path}`;
  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN;
  if (root && !root.startsWith("localhost")) {
    // If the root is a *.vercel.app address, subdomains don't work: use the /c/ path form.
    return root.endsWith(".vercel.app") ? `https://${root}/c/${cafe.slug}${path}` : `https://${cafe.slug}.${root}${path}`;
  }
  return `http://localhost:3000/c/${cafe.slug}${path}`;
}

/** "https://host" of the current request (behind Vercel's proxy too). */
export function requestOrigin(req: Request): string {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? new URL(req.url).host;
  const proto = req.headers.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Origin of the current request, from inside a server action or page. */
export async function currentOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
