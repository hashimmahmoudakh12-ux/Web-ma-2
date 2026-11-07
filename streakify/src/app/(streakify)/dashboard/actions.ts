"use server";
/**
 * OWNER ACTIONS. The café always comes from the owner's own login (never from
 * the request), and with Supabase the database double-checks via Row Level
 * Security / owner_update_program().
 */
import { revalidatePath } from "next/cache";
import { audit, getAuth, requireOwnerCafe } from "@/lib/auth";
import type { Brand } from "@/lib/brand";
import { normalizePhone } from "@/lib/phone";
import { programSchema, type Program } from "@/lib/program";

export async function saveOwnerSettingsAction(program: Program, _brand: Brand): Promise<{ ok: boolean; message: string }> {
  void _brand; // owners can't change branding
  const ctx = await requireOwnerCafe();
  if (ctx.viewingAs) return { ok: false, message: "View-as mode is read-only." };
  const parsed = programSchema.safeParse({ ...program, menu: ctx.cafe.program.menu });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  try {
    await ctx.repo.ownerUpdateProgram(ctx.cafe.id, parsed.data);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not save" };
  }
  // With Supabase the database function writes the audit entry itself.
  if (getAuth().kind === "local") await audit("cafe.rewards.update", { session: ctx.session, cafeId: ctx.cafe.id });
  revalidatePath("/dashboard");
  return { ok: true, message: "Saved. Changes apply to the next check-in." };
}

/** Privacy request: "please delete my data". */
export async function deleteCustomerAction(rawPhone: string): Promise<{ ok: boolean; message: string }> {
  const ctx = await requireOwnerCafe();
  if (ctx.viewingAs) return { ok: false, message: "View-as mode is read-only." };
  const phone = normalizePhone(rawPhone);
  if (!phone) return { ok: false, message: "Enter a valid phone number." };
  const customer = (await ctx.repo.listCustomers(ctx.cafe.id)).find((c) => c.phone === phone);
  if (!customer) return { ok: false, message: "No member with that number." };
  await ctx.repo.deleteCustomer(ctx.cafe.id, customer.id);
  await audit("customer.deleted", { session: ctx.session, cafeId: ctx.cafe.id, details: { customer: customer.firstName } });
  return { ok: true, message: `Deleted ${customer.firstName} and all their visit history.` };
}
