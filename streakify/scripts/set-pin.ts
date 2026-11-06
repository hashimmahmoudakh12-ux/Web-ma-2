/**
 * Change a café's counter PIN:   npm run set-pin -- sanaacafe 4821
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";
import { hashSecret } from "../src/lib/auth";

async function main() {
  const [slug, pin] = process.argv.slice(2);
  if (!slug || !pin || !/^\d{4,8}$/.test(pin)) throw new Error("Usage: npm run set-pin -- <cafe-slug> <4-8 digit PIN>");
  const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data, error } = await db.from("cafes").update({ counter_pin_hash: hashSecret(pin) }).eq("slug", slug).select("name");
  if (error) throw error;
  if (!data?.length) throw new Error(`No café with slug "${slug}"`);
  console.log(`PIN updated for ${data[0].name}. Tablets stay unlocked until their cookie expires or staff tap Lock.`);
}
main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
