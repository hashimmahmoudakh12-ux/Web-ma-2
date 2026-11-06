/**
 * streakify.com (the root domain). In phase 4 this becomes your admin area;
 * for now it's a handy list of cafés with links to their screens.
 */
import { connection } from "next/server";
import { Suspense } from "react";
import { getRepo } from "@/lib/data";
import { ROOT_DOMAIN } from "@/lib/tenant";

async function CafeList() {
  await connection(); // always read fresh data (never bake it in at build time)
  const repo = getRepo();
  const cafes = await repo.listCafes();
  const protocol = ROOT_DOMAIN.startsWith("localhost") ? "http" : "https";
  return (
    <>
      {repo.kind === "memory" && (
        <p className="mb-6 rounded-lg border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-200">
          Running without Supabase (in-memory data, resets on restart). Add your Supabase keys to
          <code className="mx-1">.env.local</code> to use the real database.
        </p>
      )}
      <ul className="space-y-3">
        {cafes.map((c) => (
          <li key={c.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-semibold">
                  {c.name} {c.isDemo && <span className="ml-2 rounded bg-teal-400/20 px-2 py-0.5 text-xs text-teal-200">DEMO</span>}
                </p>
                <p className="text-sm text-white/50">{c.slug}.{ROOT_DOMAIN}</p>
              </div>
              <div className="flex gap-2 text-sm">
                <a className="rounded-lg bg-white/10 px-3 py-2 hover:bg-white/20" href={`${protocol}://${c.slug}.${ROOT_DOMAIN}/counter`}>
                  Counter
                </a>
                <a className="rounded-lg bg-white/10 px-3 py-2 hover:bg-white/20" href={`/c/${c.slug}/counter`} title="Works on any URL, e.g. Vercel previews">
                  Counter (path link)
                </a>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-12 text-neutral-100" style={{ background: "#0b0b0c", minHeight: "100vh" }}>
      <h1 className="text-3xl font-bold">Streakify</h1>
      <p className="mt-1 mb-8 text-white/60">Streak-based loyalty for coffee shops.</p>
      <Suspense fallback={<p className="text-white/50">Loading cafés…</p>}>
        <CafeList />
      </Suspense>
    </main>
  );
}
