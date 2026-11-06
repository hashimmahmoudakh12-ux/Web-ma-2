/**
 * SEED SCRIPT: puts the starting cafés into your Supabase database.
 *
 *   npm run db:seed
 *
 * - Creates/updates "Sana'a Cafe" and the demo café (branding, rules, PIN).
 * - Fills the demo café with fake customers (wipes old demo data first).
 * - Never touches real customers of real cafés.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { hashPin } from "../src/lib/counter-auth";
import { seedCafes } from "../src/lib/demo/cafes";
import { generateDemoData } from "../src/lib/demo/generate";
import { SupabaseRepo } from "../src/lib/data/supabase-repo";
import { parseProgram } from "../src/lib/program";

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first");
  const db = createClient(url, key, { auth: { persistSession: false } });
  const repo = new SupabaseRepo(url, key);

  for (const cafe of seedCafes) {
    const existing = await db.from("cafes").select("id").eq("slug", cafe.slug).maybeSingle();
    if (existing.error) throw existing.error;
    const row = {
      slug: cafe.slug,
      name: cafe.name,
      timezone: cafe.timezone,
      currency: cafe.currency,
      is_demo: cafe.isDemo,
      brand: cafe.brand,
      program: parseProgram(cafe.program),
    };
    let id: string;
    if (existing.data) {
      // Existing café: refresh branding/rules only if --force, keep the PIN.
      id = existing.data.id;
      if (process.argv.includes("--force")) {
        const up = await db.from("cafes").update(row).eq("id", id);
        if (up.error) throw up.error;
        console.log(`Updated ${cafe.name}`);
      } else {
        console.log(`${cafe.name} already exists (use --force to overwrite its settings)`);
      }
    } else {
      const ins = await db.from("cafes").insert({ ...row, counter_pin_hash: hashPin(cafe.counterPin) }).select("id").single();
      if (ins.error) throw ins.error;
      id = ins.data.id;
      console.log(`Created ${cafe.name} (counter PIN ${cafe.counterPin})`);
    }

    if (cafe.isDemo) {
      const data = generateDemoData(parseProgram(cafe.program), cafe.timezone);
      await repo.replaceDemoData(id, data);
      console.log(`  Demo data: ${data.customers.length} customers, ${data.visits.length} visits, ${data.rewards.length} rewards`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
