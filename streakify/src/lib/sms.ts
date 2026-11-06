/**
 * TEXT REMINDERS through Twilio (phase 5).
 *
 * Rules we never break:
 *  - Only text customers with sms_opt_in = true (they ticked the box).
 *  - Every text says how to stop (Reply STOP).
 *  - Never the same reminder twice (sms_log.dedupe_key).
 *  - STOP replies turn sms_opt_in off (see /api/twilio/inbound).
 *
 * Env vars: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and either TWILIO_FROM
 * (a phone number like +13135550000) or TWILIO_MESSAGING_SERVICE_SID.
 * Without them, nothing is sent: messages are logged as "dry_run".
 */
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getRepo, type Cafe, type Customer } from "./data";
import { formatMoney } from "./money";
import { streakRisk } from "./streak/engine";
import { formatDay } from "./time";
import { publicCafeUrl } from "./urls";
import { pushToCustomer } from "./push";

export function twilioConfigured() {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && (process.env.TWILIO_FROM || process.env.TWILIO_MESSAGING_SERVICE_SID));
}

export async function sendSms(to: string, body: string): Promise<{ status: "sent" | "dry_run" | "failed"; providerId?: string; error?: string }> {
  if (!twilioConfigured()) {
    console.log(`[sms] dry run -> ${to.slice(0, -4)}****: ${body}`);
    return { status: "dry_run" };
  }
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const form = new URLSearchParams({ To: to, Body: body });
  if (process.env.TWILIO_MESSAGING_SERVICE_SID) form.set("MessagingServiceSid", process.env.TWILIO_MESSAGING_SERVICE_SID);
  else form.set("From", process.env.TWILIO_FROM!);
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form,
  });
  const json = (await res.json().catch(() => ({}))) as { sid?: string; message?: string };
  if (!res.ok) return { status: "failed", error: json.message ?? `HTTP ${res.status}` };
  return { status: "sent", providerId: json.sid };
}

/** Checks a webhook really came from Twilio (X-Twilio-Signature). */
export function validTwilioSignature(url: string, params: Record<string, string>, signature: string | null): boolean {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token || !signature) return false;
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  const expected = Buffer.from(createHmac("sha1", token).update(data).digest("base64"));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function reminderText(cafe: Cafe, c: Customer, atRiskCents: number, endsOn: string) {
  const link = publicCafeUrl(cafe, `/me/${c.publicToken}`);
  return `${cafe.name}: Hi ${c.firstName}, your streak ends tomorrow, that's ${formatMoney(atRiskCents, cafe.currency)} you'll lose. Stop by before ${formatDay(endsOn)} ends! ${link} Reply STOP to opt out.`;
}

/** Sends "your streak ends tomorrow" texts for one café. */
export async function runStreakReminders(cafe: Cafe, now = new Date()) {
  const result = { checked: 0, sent: 0, dryRun: 0, failed: 0, skipped: 0, pushes: 0 };
  if (!cafe.program.smsRemindersEnabled || cafe.isDemo) return result;
  const repo = getRepo();
  const all = await repo.listCustomers(cafe.id);

  // Push notifications (home-screen app). Having a subscription = they allowed it.
  for (const c of all) {
    const risk = streakRisk(c, cafe.program, { now, timeZone: cafe.timezone });
    if (!risk || risk.daysLeft !== 1 || risk.saverWillCover) continue;
    if (!(await repo.listPushSubscriptions(cafe.id, c.id)).length) continue;
    if (!(await repo.claimJob(cafe.id, `push-risk:${c.id}`, risk.endsOn))) continue;
    result.pushes += await pushToCustomer(cafe.id, c.id, {
      title: `🔥 Your ${c.streakWeeks}-week streak ends tomorrow`,
      body: `That's ${formatMoney(risk.atRiskCents, cafe.currency)} you'll lose. Stop by ${cafe.name}!`,
      url: publicCafeUrl(cafe, `/me/${c.publicToken}`),
      tag: "streak-risk",
    });
  }

  const customers = all.filter((c) => c.smsOptIn); // consent check
  for (const c of customers) {
    result.checked++;
    const risk = streakRisk(c, cafe.program, { now, timeZone: cafe.timezone });
    if (!risk || risk.daysLeft !== 1 || risk.saverWillCover) continue; // saver covers it: don't nag
    const body = reminderText(cafe, c, risk.atRiskCents, risk.endsOn);
    const id = await repo.claimSms({ cafeId: cafe.id, customerId: c.id, phone: c.phone, dedupeKey: `streak-risk:${risk.endsOn}:${c.id}`, body, status: "sending" });
    if (!id) {
      result.skipped++;
      continue;
    }
    const sent = await sendSms(c.phone, body);
    await repo.finishSms(id, { status: sent.status, providerId: sent.providerId ?? null, error: sent.error ?? null });
    if (sent.status === "sent") result.sent++;
    else if (sent.status === "dry_run") result.dryRun++;
    else result.failed++;
  }
  return result;
}
