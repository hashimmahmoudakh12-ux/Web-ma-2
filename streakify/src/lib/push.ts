/**
 * WEB PUSH for the home-screen app (iPhone iOS 16.4+ once installed, Android, desktop).
 * Only customers who tapped "Turn on notifications" AND allowed it have a subscription.
 *
 * Setup: generate keys once with   npx web-push generate-vapid-keys
 * then set NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT
 * (VAPID_SUBJECT = "mailto:you@yourdomain.com").
 */
import "server-only";
import * as webpush from "web-push";
import { getRepo, type PushSubscriptionRow } from "./data";

export function pushConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

let ready = false;
function setup() {
  if (ready) return;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:hello@streakify.com", process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  ready = true;
}

export type PushMessage = { title: string; body: string; url: string; tag?: string };

/** Sends to every device of one customer. Dead subscriptions are cleaned up. */
export async function pushToCustomer(cafeId: string, customerId: string, msg: PushMessage): Promise<number> {
  if (!pushConfigured()) return 0;
  setup();
  const repo = getRepo();
  const subs = await repo.listPushSubscriptions(cafeId, customerId);
  let sent = 0;
  await Promise.all(
    subs.map(async (s: PushSubscriptionRow) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(msg), { TTL: 60 * 60 * 12 });
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await repo.deletePushSubscription(s.endpoint);
        else console.warn("[push] failed", code);
      }
    }),
  );
  return sent;
}
