/**
 * MULTI-TENANT ROUTING: figures out which café a request is for.
 *
 *   sanaacafe.streakify.com      -> café with slug "sanaacafe"
 *   sanaacafe.localhost:3000     -> same, on your laptop
 *   rewards.sanaacafe.com        -> café whose custom_domain matches
 *   any-host/c/sanaacafe/...     -> fallback for Vercel preview URLs
 */
import "server-only";
import { cache } from "react";
import { getRepo, type Cafe } from "./data";

export const ROOT_DOMAIN = (process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000").toLowerCase();

/**
 * The `site` key the proxy put in the URL: "s~<slug>" or "h~<hostname>".
 * (Only URL-safe characters, so every hosting router passes it through untouched.)
 */
export const resolveCafe = cache(async (siteKey: string): Promise<Cafe | null> => {
  const key = decodeURIComponent(siteKey);
  const repo = getRepo();
  if (key.startsWith("s~")) return repo.getCafeBySlug(key.slice(2));
  if (key.startsWith("h~")) return repo.getCafeByDomain(key.slice(2));
  return null;
});
