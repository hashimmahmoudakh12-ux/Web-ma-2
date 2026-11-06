/**
 * Twilio calls this when a customer texts back. Set it in Twilio:
 *   Phone number -> Messaging -> "A message comes in" -> Webhook (POST)
 *   https://streakify.com/api/twilio/inbound
 * STOP-type replies switch texting off for that number at every café.
 * (Twilio also blocks further texts itself; we keep our records in sync.)
 */
import { connection } from "next/server";
import { getRepo } from "@/lib/data";
import { validTwilioSignature } from "@/lib/sms";

const STOP_WORDS = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "OPTOUT", "REVOKE"]);

const twiml = (msg?: string) =>
  new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${msg ? `<Message>${msg}</Message>` : ""}</Response>`, {
    headers: { "Content-Type": "text/xml" },
  });

export async function POST(request: Request) {
  await connection();
  const form = await request.formData();
  const params: Record<string, string> = {};
  form.forEach((v, k) => (params[k] = String(v)));
  const url = process.env.TWILIO_WEBHOOK_URL ?? request.url;
  if (!validTwilioSignature(url, params, request.headers.get("x-twilio-signature"))) {
    return new Response("invalid signature", { status: 403 });
  }
  const word = (params.Body ?? "").trim().toUpperCase().replace(/[^A-Z]/g, "");
  if (STOP_WORDS.has(word) && params.From) {
    await getRepo().optOutPhoneEverywhere(params.From);
    return twiml(); // Twilio sends its own STOP confirmation
  }
  return twiml();
}
