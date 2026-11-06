/**
 * GOOGLE WALLET loyalty card for Android customers.
 *
 * Setup (free):
 *   1. pay.google.com/business/console -> Google Wallet API -> get your Issuer ID.
 *   2. Google Cloud: enable "Google Wallet API", create a service account,
 *      download its JSON key, and add the service account's email as a user in
 *      the Wallet console.
 *   3. Env vars: GOOGLE_WALLET_ISSUER_ID and GOOGLE_WALLET_SERVICE_ACCOUNT
 *      (the JSON key file, base64-encoded on one line).
 *
 * "Add to Google Wallet" = a signed link (JWT) containing the card. Updates =
 * we PUT the card again through the API whenever the streak/level changes.
 * NOTE: built to Google's docs; needs real credentials to test end to end.
 */
import "server-only";
import { createSign } from "node:crypto";
import type { Cafe, Customer } from "../data";
import { passData } from "./data";

type ServiceAccount = { client_email: string; private_key: string };

function account(): ServiceAccount | null {
  const raw = process.env.GOOGLE_WALLET_SERVICE_ACCOUNT;
  if (!raw || !process.env.GOOGLE_WALLET_ISSUER_ID) return null;
  try {
    return JSON.parse(Buffer.from(raw, "base64").toString("utf8")) as ServiceAccount;
  } catch {
    return null;
  }
}

export const googleWalletConfigured = () => account() !== null;

const b64url = (v: string | Buffer) => Buffer.from(v).toString("base64url");

function signJwt(payload: object, key: string): string {
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const sig = createSign("RSA-SHA256").update(`${head}.${body}`).sign(key);
  return `${head}.${body}.${b64url(sig)}`;
}

const issuer = () => process.env.GOOGLE_WALLET_ISSUER_ID!;
const classId = (cafe: Cafe) => `${issuer()}.streakify-${cafe.slug}`;
const objectId = (c: Customer) => `${issuer()}.c-${c.id}`;

function loyaltyClass(cafe: Cafe, origin: string) {
  return {
    id: classId(cafe),
    issuerName: cafe.name,
    programName: `${cafe.name} Rewards`,
    programLogo: { sourceUri: { uri: `${origin}/api/icon/${cafe.slug}/512` }, contentDescription: { defaultValue: { language: "en-US", value: cafe.name } } },
    hexBackgroundColor: cafe.brand.colors.background,
    reviewStatus: "UNDER_REVIEW",
  };
}

async function loyaltyObject(cafe: Cafe, c: Customer) {
  const d = await passData(cafe, c);
  return {
    id: objectId(c),
    classId: classId(cafe),
    state: "ACTIVE",
    accountId: c.referralCode,
    accountName: d.firstName,
    loyaltyPoints: { label: "XP", balance: { int: d.xp } },
    secondaryLoyaltyPoints: { label: "Streak", balance: { string: d.streak } },
    barcode: { type: "QR_CODE", value: d.qr, alternateText: "Scan at the counter" },
    textModulesData: [
      { id: "level", header: "Level", body: `${d.levelIcon} ${d.level}` },
      { id: "saved", header: "Total saved", body: d.saved },
      { id: "rewards", header: "Rewards ready", body: d.rewards },
      { id: "next", header: "Next up", body: d.nextUp },
    ],
    hexBackgroundColor: cafe.brand.colors.background,
  };
}

/** The "Add to Google Wallet" link. */
export async function googleSaveUrl(cafe: Cafe, c: Customer, origin: string): Promise<string> {
  const sa = account();
  if (!sa) throw new Error("Google Wallet is not configured");
  const jwt = signJwt(
    {
      iss: sa.client_email,
      aud: "google",
      typ: "savetowallet",
      origins: [origin],
      payload: { loyaltyClasses: [loyaltyClass(cafe, origin)], loyaltyObjects: [await loyaltyObject(cafe, c)] },
    },
    sa.private_key,
  );
  return `https://pay.google.com/gp/v/save/${jwt}`;
}

let token: { value: string; exp: number } | null = null;
async function accessToken(sa: ServiceAccount) {
  if (token && token.exp > Date.now() + 60_000) return token.value;
  const now = Math.floor(Date.now() / 1000);
  const assertion = signJwt(
    { iss: sa.client_email, scope: "https://www.googleapis.com/auth/wallet_object.issuer", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 },
    sa.private_key,
  );
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  if (!res.ok) throw new Error(`Google token error ${res.status}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  token = { value: json.access_token, exp: Date.now() + json.expires_in * 1000 };
  return token.value;
}

/** Pushes the latest numbers to the customer's Google Wallet card (if they saved one). */
export async function updateGooglePass(cafe: Cafe, c: Customer): Promise<void> {
  const sa = account();
  if (!sa) return;
  const res = await fetch(`https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject/${encodeURIComponent(objectId(c))}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${await accessToken(sa)}`, "Content-Type": "application/json" },
    body: JSON.stringify(await loyaltyObject(cafe, c)),
  });
  if (res.status === 404) return; // they never added the card
  if (!res.ok) console.warn(`[wallet] Google update failed ${res.status}`);
}
