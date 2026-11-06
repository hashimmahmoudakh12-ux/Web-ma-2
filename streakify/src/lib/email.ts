/**
 * Sends email through Resend (resend.com), simple and free to start.
 * Needs env vars RESEND_API_KEY and REPORT_FROM_EMAIL (an address on a domain
 * you verified in Resend, e.g. reports@streakify.com).
 * Without them, emails are skipped and logged instead (safe default).
 */
import "server-only";

export type Attachment = { filename: string; content: Uint8Array };

export async function sendEmail(to: string, subject: string, html: string, attachments: Attachment[] = []): Promise<{ sent: boolean; reason?: string }> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.REPORT_FROM_EMAIL;
  if (!key || !from) {
    console.log(`[email] skipped (RESEND_API_KEY/REPORT_FROM_EMAIL not set): "${subject}" -> ${to}`);
    return { sent: false, reason: "Email not configured" };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html,
      attachments: attachments.map((a) => ({ filename: a.filename, content: Buffer.from(a.content).toString("base64") })),
    }),
  });
  if (!res.ok) return { sent: false, reason: `Resend error ${res.status}: ${await res.text()}` };
  return { sent: true };
}
