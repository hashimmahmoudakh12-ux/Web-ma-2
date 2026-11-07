"use server";
/**
 * ADMIN ACTIONS (you only). Every action re-checks the admin login + 2FA on
 * the server (requireAdmin) and writes an audit log entry.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { audit, getAuth, requireAdmin } from "@/lib/auth";
import { brandSchema } from "@/lib/brand";
import { getRepo, type CafeStatus } from "@/lib/data";
import { demoCafe } from "@/lib/demo/cafes";
import { generateDemoData } from "@/lib/demo/generate";
import { sendEmail } from "@/lib/email";
import { runDailyJobs } from "@/lib/jobs";
import { programSchema } from "@/lib/program";
import { renderMonthlyReport } from "@/lib/report";
import { hashSecret } from "@/lib/secrets";
import { formatMonth } from "@/lib/time";
import { currentOrigin } from "@/lib/urls";

export type Result = { ok: boolean; message: string; link?: string };

// ---- two-factor setup ---------------------------------------------------------
export async function enrollMfaAction() {
  await requireAdmin({ allowWithoutMfa: true });
  return getAuth().enrollMfa();
}

export async function confirmMfaAction(factorId: string, code: string): Promise<Result> {
  const s = await requireAdmin({ allowWithoutMfa: true });
  const ok = await getAuth().confirmMfaEnroll(factorId, code);
  if (!ok) return { ok: false, message: "That code didn't work. Try the newest code." };
  await audit("mfa.enrolled", { session: s });
  return { ok: true, message: "Two-factor login is on." };
}

// ---- subdomains ---------------------------------------------------------------------
const RESERVED = new Set(["www", "admin", "app", "api", "login", "dashboard", "auth", "lab", "mail", "help", "support", "status", "blog", "c", "site", "static", "assets"]);
const slugSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/, "2–40 letters, numbers or dashes");

export async function checkSlugAction(slug: string, exceptCafeId?: string): Promise<{ ok: boolean; message: string }> {
  await requireAdmin();
  const p = slugSchema.safeParse(slug);
  if (!p.success) return { ok: false, message: p.error.issues[0].message };
  if (RESERVED.has(p.data)) return { ok: false, message: "That name is reserved." };
  const existing = await getRepo().getCafeBySlug(p.data);
  if (existing && existing.id !== exceptCafeId) return { ok: false, message: "Already taken." };
  return { ok: true, message: "Available" };
}

// ---- create a café (the wizard) ---------------------------------------------
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const newCafeSchema = z.object({
  name: z.string().trim().min(2).max(60),
  address: z.string().trim().max(200),
  ownerName: z.string().trim().max(80),
  ownerEmail: z.email(),
  ownerPhone: z.string().trim().max(30),
  slug: slugSchema,
  timezone: z.string().refine((tz) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "Unknown time zone"),
  logoUrl: z.string().max(400_000).nullable(), // small data: URL from the wizard (resized in the browser)
  colors: z.object({ background: hex, surface: hex, primary: hex, onPrimary: hex, text: hex, muted: hex }),
  tagline: z.string().max(80).optional(),
  program: programSchema,
  status: z.enum(["trial", "active"]),
  planPriceCents: z.number().int().min(0),
  setupFeePaid: z.boolean(),
  demo: z.boolean(),
});
export type NewCafeInput = z.input<typeof newCafeSchema>;

export async function createCafeAction(input: NewCafeInput): Promise<Result & { cafeId?: string; pin?: string; emailed?: boolean }> {
  const s = await requireAdmin();
  const parsed = newCafeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: `${parsed.error.issues[0].path.join(".")}: ${parsed.error.issues[0].message}` };
  const d = parsed.data;
  const slugCheck = await checkSlugAction(d.slug);
  if (!slugCheck.ok) return { ok: false, message: `Subdomain: ${slugCheck.message}` };
  if (await getAuth().findByEmail(d.ownerEmail)) return { ok: false, message: "That owner email already has a Streakify account." };

  const repo = getRepo();
  const pin = String(Math.floor(1000 + Math.random() * 9000));
  const cafe = await repo.createCafe({
    slug: d.slug,
    name: d.name,
    timezone: d.timezone,
    currency: "USD",
    isDemo: d.demo,
    brand: brandSchema.parse({ logoUrl: d.logoUrl, colors: d.colors, tagline: d.tagline || undefined }),
    program: d.program,
    counterPinHash: hashSecret(pin),
    ownerEmail: d.ownerEmail,
    status: d.status,
    planPriceCents: d.planPriceCents,
    setupFeePaid: d.setupFeePaid,
    address: d.address || null,
    ownerName: d.ownerName || null,
    ownerPhone: d.ownerPhone || null,
  });
  if (d.demo) await repo.replaceDemoData(cafe.id, generateDemoData(cafe.program, cafe.timezone));

  let link: string | undefined;
  let emailed = false;
  try {
    const inv = await getAuth().inviteOwner({ email: d.ownerEmail, name: d.ownerName || null, cafeId: cafe.id, title: "Owner" }, await currentOrigin());
    link = inv.link;
    emailed = (await sendInvite(d.ownerEmail, d.ownerName, d.name, inv.link)).sent;
  } catch (e) {
    await audit("cafe.create", { session: s, cafeId: cafe.id, details: { slug: d.slug, ownerInviteError: String(e) } });
    return { ok: true, cafeId: cafe.id, pin, message: `Café created, but the owner invite failed: ${e instanceof Error ? e.message : e}. Add the owner from the café's Team section.` };
  }
  await audit("cafe.create", { session: s, cafeId: cafe.id, details: { slug: d.slug, owner: d.ownerEmail, demo: d.demo, plan: d.planPriceCents, status: d.status } });
  revalidatePath("/admin");
  return { ok: true, cafeId: cafe.id, pin, link, emailed, message: emailed ? `Invite emailed to ${d.ownerEmail}.` : "Email isn't set up, so copy the invite link below and send it to the owner." };
}

async function sendInvite(email: string, name: string | null | undefined, cafeName: string, link: string) {
  return sendEmail(
    email,
    `You're invited to manage ${cafeName} on Streakify`,
    `<p>Hi${name ? ` ${name}` : ""},</p><p>Your rewards program for <strong>${cafeName}</strong> is ready. Set your password to open your dashboard:</p><p><a href="${link}">Set my password</a></p><p>This link works once. Questions? Just reply.</p><p style="color:#888">Streakify</p>`,
  );
}

// ---- café settings (admin) --------------------------------------------------------
const adminPatchSchema = z.object({
  name: z.string().trim().min(2).max(60),
  slug: slugSchema,
  customDomain: z.union([z.literal(""), z.string().toLowerCase().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, "Domain like rewards.example.com")]),
  timezone: z.string(),
  address: z.string().trim().max(200),
  ownerName: z.string().trim().max(80),
  ownerEmail: z.union([z.literal(""), z.email()]),
  ownerPhone: z.string().trim().max(30),
  planPriceCents: z.number().int().min(0),
  setupFeePaid: z.boolean(),
  posProvider: z.enum(["none", "toast"]),
  toastRestaurantGuid: z.string().trim(),
  toastDiscountGuid: z.string().trim(),
});
export type AdminPatchInput = z.input<typeof adminPatchSchema>;

export async function updateCafeAdminAction(cafeId: string, input: AdminPatchInput): Promise<Result> {
  const s = await requireAdmin();
  const p = adminPatchSchema.safeParse(input);
  if (!p.success) return { ok: false, message: p.error.issues[0].message };
  const d = p.data;
  try {
    new Intl.DateTimeFormat("en", { timeZone: d.timezone });
  } catch {
    return { ok: false, message: "Unknown time zone" };
  }
  const slugCheck = await checkSlugAction(d.slug, cafeId);
  if (!slugCheck.ok) return { ok: false, message: `Subdomain: ${slugCheck.message}` };
  if (d.posProvider === "toast" && !d.toastRestaurantGuid) return { ok: false, message: "Toast needs the restaurant GUID" };
  try {
    await getRepo().updateCafe(cafeId, {
      name: d.name,
      slug: d.slug,
      customDomain: d.customDomain || null,
      timezone: d.timezone,
      address: d.address || null,
      ownerName: d.ownerName || null,
      ownerEmail: d.ownerEmail || null,
      ownerPhone: d.ownerPhone || null,
      planPriceCents: d.planPriceCents,
      setupFeePaid: d.setupFeePaid,
      posProvider: d.posProvider,
      posConfig: d.posProvider === "toast" ? { restaurantGuid: d.toastRestaurantGuid, streakRewardDiscountGuid: d.toastDiscountGuid || undefined } : {},
    });
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not save" };
  }
  await audit("cafe.update", { session: s, cafeId, details: { fields: Object.keys(d) } });
  revalidatePath(`/admin/cafes/${cafeId}`);
  return { ok: true, message: "Saved." };
}

export async function setStatusAction(cafeId: string, status: CafeStatus): Promise<Result> {
  const s = await requireAdmin();
  if (!["trial", "active", "paused", "cancelled"].includes(status)) return { ok: false, message: "Unknown status" };
  await getRepo().updateCafe(cafeId, { status });
  await audit("cafe.status", { session: s, cafeId, details: { status } });
  revalidatePath(`/admin/cafes/${cafeId}`);
  revalidatePath("/admin");
  return { ok: true, message: status === "paused" ? "Paused. The counter now shows “Rewards paused”; all data is kept." : `Status set to ${status}.` };
}

export async function setPinAction(cafeId: string, pin: string): Promise<Result> {
  const s = await requireAdmin();
  if (!/^\d{4,8}$/.test(pin)) return { ok: false, message: "PIN: 4 to 8 digits" };
  await getRepo().updateCafe(cafeId, { counterPinHash: hashSecret(pin) });
  await audit("cafe.pin_changed", { session: s, cafeId });
  return { ok: true, message: "Counter PIN changed. Tablets stay unlocked until someone taps Lock." };
}

/** Full settings (rewards AND admin-only parts: logo, colors, menu). */
export async function saveFullSettingsAction(cafeId: string, programJson: unknown, brandJson: unknown): Promise<Result> {
  const s = await requireAdmin();
  const program = programSchema.safeParse(programJson);
  if (!program.success) return { ok: false, message: program.error.issues[0].message };
  const brand = brandSchema.safeParse(brandJson);
  if (!brand.success) return { ok: false, message: brand.error.issues[0].message };
  await getRepo().updateCafe(cafeId, { program: program.data, brand: brand.data });
  await audit("cafe.settings", { session: s, cafeId });
  revalidatePath("/site/[site]", "layout");
  return { ok: true, message: "Saved. Changes apply to the next check-in." };
}

export async function setDemoAction(cafeId: string, on: boolean): Promise<Result> {
  const s = await requireAdmin();
  const repo = getRepo();
  const cafe = await repo.getCafeById(cafeId);
  if (!cafe) return { ok: false, message: "Unknown café" };
  if (on) {
    await repo.updateCafe(cafeId, { isDemo: true });
    await repo.replaceDemoData(cafeId, generateDemoData(cafe.program, cafe.timezone));
  } else {
    // Turning demo off wipes the fake customers so the café starts clean.
    await repo.replaceDemoData(cafeId, { customers: [], visits: [], rewards: [], squads: [] });
    await repo.updateCafe(cafeId, { isDemo: false });
  }
  await audit(on ? "cafe.demo_on" : "cafe.demo_off", { session: s, cafeId });
  revalidatePath(`/admin/cafes/${cafeId}`);
  return { ok: true, message: on ? "Filled with fake customers for pitching." : "Demo data removed. The café starts clean." };
}

// ---- team (owners / managers) ------------------------------------------------------
export async function teamInviteAction(cafeId: string, email: string, name: string, title: string): Promise<Result> {
  const s = await requireAdmin();
  const e = z.email().safeParse(email.trim());
  if (!e.success) return { ok: false, message: "Enter a valid email." };
  const cafe = await getRepo().getCafeById(cafeId);
  if (!cafe) return { ok: false, message: "Unknown café" };
  try {
    const inv = await getAuth().inviteOwner({ email: e.data, name: name.trim() || null, cafeId, title: title === "Manager" ? "Manager" : "Owner" }, await currentOrigin());
    const sent = await sendInvite(e.data, name, cafe.name, inv.link);
    await audit("team.invite", { session: s, cafeId, details: { email: e.data, title } });
    revalidatePath(`/admin/cafes/${cafeId}`);
    return sent.sent ? { ok: true, message: `Invite emailed to ${e.data}.` } : { ok: true, message: "Email isn't set up. Copy this invite link and send it:", link: inv.link };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Could not invite" };
  }
}

async function memberOf(cafeId: string, userId: string) {
  const u = await getAuth().getUser(userId);
  return u && u.role === "owner" && u.cafeId === cafeId ? u : null;
}

export async function teamResetAction(cafeId: string, userId: string): Promise<Result> {
  const s = await requireAdmin();
  const u = await memberOf(cafeId, userId);
  if (!u) return { ok: false, message: "Not a member of this café." };
  const link = await getAuth().resetLink(u.email, await currentOrigin());
  if (!link) return { ok: false, message: "Could not create a reset link." };
  const sent = await sendEmail(u.email, "Reset your Streakify password", `<p>Use this link to set a new password:</p><p><a href="${link}">Set a new password</a></p><p style="color:#888">Streakify</p>`);
  await audit("team.reset_password", { session: s, cafeId, details: { email: u.email } });
  return sent.sent ? { ok: true, message: `Reset link emailed to ${u.email}.` } : { ok: true, message: "Email isn't set up. Send them this reset link:", link };
}

export async function teamChangeEmailAction(cafeId: string, userId: string, email: string): Promise<Result> {
  const s = await requireAdmin();
  const u = await memberOf(cafeId, userId);
  const e = z.email().safeParse(email.trim());
  if (!u || !e.success) return { ok: false, message: "Enter a valid email." };
  try {
    await getAuth().changeEmail(userId, e.data);
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Could not change email" };
  }
  await audit("team.email_changed", { session: s, cafeId, details: { from: u.email, to: e.data } });
  revalidatePath(`/admin/cafes/${cafeId}`);
  return { ok: true, message: "Email changed." };
}

export async function teamRemoveAction(cafeId: string, userId: string): Promise<Result> {
  const s = await requireAdmin();
  const u = await memberOf(cafeId, userId);
  if (!u) return { ok: false, message: "Not a member of this café." };
  await getAuth().removeUser(userId);
  await audit("team.removed", { session: s, cafeId, details: { email: u.email } });
  revalidatePath(`/admin/cafes/${cafeId}`);
  return { ok: true, message: `${u.email} can no longer sign in.` };
}

// ---- reports, jobs, delete ---------------------------------------------------------
export async function emailReportAction(cafeId: string, month: string): Promise<Result> {
  const s = await requireAdmin();
  const cafe = await getRepo().getCafeById(cafeId);
  if (!cafe) return { ok: false, message: "Unknown café" };
  if (!cafe.ownerEmail) return { ok: false, message: "Set the owner's email first" };
  const pdf = await renderMonthlyReport(cafe, month);
  const r = await sendEmail(cafe.ownerEmail, `${cafe.name}: your ${formatMonth(month)} rewards report`, `<p>Your ${formatMonth(month)} rewards report is attached.</p><p style="color:#888">Powered by Streakify</p>`, [
    { filename: `${cafe.slug}-${month}-report.pdf`, content: pdf },
  ]);
  await audit("report.emailed", { session: s, cafeId, details: { month, sent: r.sent } });
  return r.sent ? { ok: true, message: `Emailed to ${cafe.ownerEmail}` } : { ok: false, message: r.reason ?? "Not sent" };
}

export async function runJobsNowAction(): Promise<Result> {
  const s = await requireAdmin();
  const out = await runDailyJobs();
  await audit("jobs.run_manually", { session: s });
  return { ok: true, message: JSON.stringify(out) };
}

export async function deleteCafeAction(cafeId: string, typedName: string): Promise<Result> {
  const s = await requireAdmin();
  const repo = getRepo();
  const cafe = await repo.getCafeById(cafeId);
  if (!cafe) return { ok: false, message: "Unknown café" };
  if (typedName.trim() !== cafe.name) return { ok: false, message: "Type the café name exactly to confirm." };
  if (cafe.slug === demoCafe.slug) return { ok: false, message: "The built-in demo café can't be deleted." };
  for (const m of await getAuth().listMembers(cafeId)) await getAuth().removeUser(m.id);
  await audit("cafe.deleted", { session: s, cafeId: null, details: { id: cafeId, name: cafe.name, slug: cafe.slug } });
  await repo.deleteCafe(cafeId);
  revalidatePath("/admin");
  redirect("/admin");
}
