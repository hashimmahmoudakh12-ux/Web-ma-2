/**
 * getRepo(): the one place that decides where data lives.
 * - Supabase keys present  -> real database.
 * - No keys (first run)     -> in-memory demo storage.
 */
import "server-only";
import { MemoryRepo } from "./memory-repo";
import { SupabaseRepo } from "./supabase-repo";
import type { Repo } from "./types";

let repo: Repo | null = null;

export function getRepo(): Repo {
  if (repo) return repo;
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    repo = new SupabaseRepo(url, key);
  } else {
    if (process.env.NODE_ENV === "production" && process.env.ALLOW_MEMORY_DB !== "true") {
      throw new Error("Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    }
    repo = new MemoryRepo();
  }
  return repo;
}

export * from "./types";
