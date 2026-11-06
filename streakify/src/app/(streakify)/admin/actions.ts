"use server";
/** Admin-only actions (you). Each checks the admin cookie. */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { checkAdminPassword, hashSecret, throttle } from "@/lib/auth";
import { getRepo } from "@/lib/data";
import { starterProgram } from "@/lib/demo/cafes";
import { sendEmail } from "@/lib/email";
import { runDailyJobs } from "@/lib/jobs";
import { renderMonthlyReport } from "@/lib/report";
import { parseProgram } from "@/lib/program";
import { clientKey, grantAdmin, isAdmin, revokeAdmin } from "@/lib/session";
import { formatMonth } from "@/lib/time";

async function requireAdmin() {
  if (!(await isAdmin())) throw new Error("Not allowed");
}

export async function adminLogin(_prev: string | null, form: FormData): Promise<string | null> {
  const ok = checkAdminPassword(String(form.get("password") ?? ""));
  if (!(await throttle(`admin:${await clientKey()}`, ok))) return ok ? "Too many tries. Wait 5 minutes." : "Wrong password";
  await grantAdmin();
  revalidatePath("/admin");
  return null;
}

export async function adminLogout() {
  await revokeAdmin();
  revalidatePath("/admin");
}

export type Result = { ok: boolean; message: string };

/** Readable text color for a background. */
function contrastText(bg: string) {
  const n = parseInt(bg.slice(1), 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.6 ? "#1a1a1a" : "#f7f2ea";
}
function mix(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, "0")).join("")}`;
}

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const newCafeSchema = z.object({
  name: z.string().trim().min(2),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,40}$/, "Subdomain: lowercase letters, numbers and dashes"),
  timezone: z.string().refine((tz) => { try { new Intl.DateTimeFormat("en", { timeZone: tz }); return true; } catch { return false; } }, "Unknown time zone"),
  background: hex,
  primary: hex,
  ownerEmail: z.union([z.literal(""), z.email()]),
  ownerPassword: z.string().min(6, "Owner password: at least 6 characters"),
  counterPin: z.string().regex(/^\d{4,8}$/, "PIN: 4 to 8 digits"),
});

export async function createCafe(_prev: Result | null, form: FormData): Promise<Result> {
  await requireAdmin();
  const parsed = newCafeSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const d = parsed.data;
  const text = contrastText(d.background);
  try {
    await getRepo().createCafe({
      slug: d.slug,
      name: d.name,
      timezone: d.timezone,
      currency: "USD",
      isDemo: false,
      brand: {
        logoUrl: null,
        colors: {
          background: d.background.toLowerCase(),
          surface: mix(d.background, text, 0.07),
          primary: d.primary.toLowerCase(),
          onPrimary: contrastText(d.primary),
          text,
          muted: mix(d.background, text, 0.6),
        },
      },
      program: parseProgram(starterProgram),
      counterPinHash: hashSecret(d.counterPin),
      ownerPasswordHash: hashSecret(d.ownerPassword),
      ownerEmail: d.ownerEmail || null,
    });
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not create café" };
  }
  revalidatePath("/admin");
  return { ok: true, message: `${d.name} created. Owner can edit rewards at ${d.slug}.<your domain>/owner.` };
}

const updateSchema = z.object({
  cafeId: z.string(),
  ownerEmail: z.union([z.literal(""), z.email()]),
  ownerPassword: z.union([z.literal(""), z.string().min(6, "Owner password: at least 6 characters")]),
  counterPin: z.union([z.literal(""), z.string().regex(/^\d{4,8}$/, "PIN: 4 to 8 digits")]),
  customDomain: z.union([z.literal(""), z.string().toLowerCase().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, "Domain like rewards.example.com")]),
  timezone: z.string(),
  posProvider: z.enum(["none", "toast"]),
  toastRestaurantGuid: z.string().trim(),
  toastDiscountGuid: z.string().trim(),
});

export async function updateCafeAdmin(_prev: Result | null, form: FormData): Promise<Result> {
  await requireAdmin();
  const parsed = updateSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const d = parsed.data;
  try {
    new Intl.DateTimeFormat("en", { timeZone: d.timezone });
  } catch {
    return { ok: false, message: "Unknown time zone" };
  }
  if (d.posProvider === "toast" && !d.toastRestaurantGuid) return { ok: false, message: "Toast needs the restaurant GUID" };
  try {
    await getRepo().updateCafe(d.cafeId, {
      ownerEmail: d.ownerEmail || null,
      customDomain: d.customDomain || null,
      timezone: d.timezone,
      posProvider: d.posProvider,
      posConfig: d.posProvider === "toast" ? { restaurantGuid: d.toastRestaurantGuid, streakRewardDiscountGuid: d.toastDiscountGuid || undefined } : {},
      ...(d.ownerPassword ? { ownerPasswordHash: hashSecret(d.ownerPassword) } : {}),
      ...(d.counterPin ? { counterPinHash: hashSecret(d.counterPin) } : {}),
    });
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not save" };
  }
  revalidatePath("/admin");
  return { ok: true, message: "Saved." };
}

export async function emailReportNow(cafeId: string, month: string): Promise<Result> {
  await requireAdmin();
  const cafe = (await getRepo().listCafes()).find((c) => c.id === cafeId);
  if (!cafe) return { ok: false, message: "Unknown café" };
  if (!cafe.ownerEmail) return { ok: false, message: "Set the owner's email first" };
  const pdf = await renderMonthlyReport(cafe, month);
  const r = await sendEmail(cafe.ownerEmail, `${cafe.name}: your ${formatMonth(month)} rewards report`, `<p>Your ${formatMonth(month)} rewards report is attached.</p><p style="color:#888">Powered by Streakify</p>`, [
    { filename: `${cafe.slug}-${month}-report.pdf`, content: pdf },
  ]);
  return r.sent ? { ok: true, message: `Emailed to ${cafe.ownerEmail}` } : { ok: false, message: r.reason ?? "Not sent" };
}

export async function runJobsNow(): Promise<Result> {
  await requireAdmin();
  const out = await runDailyJobs();
  return { ok: true, message: JSON.stringify(out) };
}
