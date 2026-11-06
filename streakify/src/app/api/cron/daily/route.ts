/**
 * Called once a day by Vercel Cron (schedule in vercel.json).
 * Vercel sends "Authorization: Bearer <CRON_SECRET>", so random visitors
 * can't trigger it.
 */
import { connection } from "next/server";
import { runDailyJobs } from "@/lib/jobs";

export const maxDuration = 300;

export async function GET(request: Request) {
  await connection();
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  return Response.json({ ok: true, results: await runDailyJobs() });
}
