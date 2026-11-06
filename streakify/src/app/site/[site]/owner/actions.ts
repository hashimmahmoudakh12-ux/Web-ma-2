"use server";
/**
 * Owner dashboard actions. Every one checks the owner cookie first
 * (the demo café is open so you can show it off in pitches).
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { throttle, verifySecret } from "@/lib/auth";
import { brandSchema } from "@/lib/brand";
import { getRepo, type Cafe } from "@/lib/data";
import { normalizePhone } from "@/lib/phone";
import { programSchema } from "@/lib/program";
import { clientKey, grantCafeAccess, hasCafeAccess, revokeCafeAccess } from "@/lib/session";
import { resolveCafe } from "@/lib/tenant";
import { cafeBase } from "@/lib/urls";

export async function ownerCafe(siteKey: string): Promise<Cafe | null> {
  const cafe = await resolveCafe(siteKey);
  if (!cafe) return null;
  if (cafe.isDemo || (await hasCafeAccess("owner", cafe))) return cafe;
  return null;
}

async function requireOwner(siteKey: string): Promise<Cafe> {
  const cafe = await ownerCafe(siteKey);
  if (!cafe) throw new Error("Please log in again.");
  return cafe;
}

export async function ownerLogin(siteKey: string, _prev: string | null, form: FormData): Promise<string | null> {
  const cafe = await resolveCafe(siteKey);
  if (!cafe) return "Unknown café";
  const ok = verifySecret(String(form.get("password") ?? ""), cafe.ownerPasswordHash);
  if (!(await throttle(`owner:${cafe.id}:${await clientKey()}`, ok))) {
    return ok ? "Too many tries. Wait 5 minutes." : "Wrong password";
  }
  await grantCafeAccess("owner", cafe);
  redirect(`${await cafeBase()}/owner`);
}

export async function ownerLogout(siteKey: string) {
  const cafe = await resolveCafe(siteKey);
  if (cafe) await revokeCafeAccess("owner", cafe);
  redirect(`${await cafeBase()}/owner`);
}

export type SaveResult = { ok: boolean; message: string };

export async function saveSettings(siteKey: string, programJson: unknown, brandJson: unknown): Promise<SaveResult> {
  const cafe = await requireOwner(siteKey);
  const program = programSchema.safeParse(programJson);
  if (!program.success) return { ok: false, message: program.error.issues[0].message };
  const brand = brandSchema.safeParse(brandJson);
  if (!brand.success) return { ok: false, message: brand.error.issues[0].message };
  await getRepo().updateCafe(cafe.id, { program: program.data, brand: brand.data });
  revalidatePath("/site/[site]", "layout");
  return { ok: true, message: "Saved. Changes apply to the next check-in." };
}

export async function deleteCustomer(siteKey: string, rawPhone: string): Promise<SaveResult> {
  const cafe = await requireOwner(siteKey);
  const phone = normalizePhone(rawPhone);
  if (!phone) return { ok: false, message: "Enter a valid phone number." };
  const repo = getRepo();
  const customer = await repo.findCustomerByPhone(cafe.id, phone);
  if (!customer) return { ok: false, message: "No member with that number." };
  await repo.deleteCustomer(cafe.id, customer.id);
  return { ok: true, message: `Deleted ${customer.firstName} and all their visit history.` };
}
