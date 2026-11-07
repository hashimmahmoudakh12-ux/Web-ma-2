/**
 * CREATE (OR RESET) YOUR ADMIN ACCOUNT — run once, from your computer:
 *
 *   npm run create-admin -- you@yourdomain.com
 *
 * - Creates the Supabase login (email already confirmed) with a random
 *   temporary password, printed ONCE below.
 * - Marks it as the one and only admin in the `profiles` table.
 * - Running it again for the same email resets the temporary password.
 * - If a DIFFERENT admin already exists it stops, unless you add --replace.
 *
 * Next: sign in at /login, set up two-factor (required), then change the
 * temporary password from Admin -> Security.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  const replace = process.argv.includes("--replace");
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) throw new Error("Usage: npm run create-admin -- you@example.com [--replace]");
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first");
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: admins, error: aErr } = await db.from("profiles").select("id, email").eq("role", "admin");
  if (aErr) throw new Error(`${aErr.message} (did you run supabase/migrations/0004_auth_roles_rls.sql?)`);
  const other = admins?.find((a) => a.email.toLowerCase() !== email);
  if (other) {
    if (!replace) throw new Error(`An admin already exists (${other.email}). There can only be one. Re-run with --replace to move admin to ${email}.`);
    await db.from("profiles").delete().eq("id", other.id);
    console.log(`Removed admin role from ${other.email}.`);
  }

  // Find the auth user by email (paged list).
  let userId: string | null = null;
  for (let page = 1; page < 50 && !userId; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    userId = data.users.find((u) => u.email?.toLowerCase() === email)?.id ?? null;
    if (data.users.length < 200) break;
  }

  const password = randomBytes(15).toString("base64url");
  if (userId) {
    const { error } = await db.auth.admin.updateUserById(userId, { password, email_confirm: true });
    if (error) throw error;
  } else {
    const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw error ?? new Error("Could not create user");
    userId = data.user.id;
  }
  const { error: pErr } = await db.from("profiles").upsert({ id: userId, email, full_name: "Streakify admin", role: "admin", cafe_id: null, title: "Admin" });
  if (pErr) throw pErr;

  console.log("\n✅ Admin account ready");
  console.log(`   Email:              ${email}`);
  console.log(`   Temporary password: ${password}`);
  console.log("\nNext: sign in at /login → you'll be asked to set up two-factor login → then change this password in Admin → Security.\n");
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
