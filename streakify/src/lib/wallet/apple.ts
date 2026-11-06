/**
 * APPLE WALLET pass (storeCard) for each customer.
 *
 * What you need from Apple (Apple Developer account, $99/year):
 *   1. Certificates, IDs & Profiles -> Identifiers -> Pass Type IDs -> create
 *      e.g. "pass.com.streakify.loyalty".
 *   2. Create its certificate, export as .p12, convert to PEM:
 *        openssl pkcs12 -in pass.p12 -clcerts -nokeys -out signerCert.pem -legacy
 *        openssl pkcs12 -in pass.p12 -nocerts -out signerKey.pem -legacy
 *   3. Download Apple's "WWDR G4" intermediate certificate (PEM).
 *   4. Put them in env vars as base64 (one line each):
 *        APPLE_PASS_TYPE_ID, APPLE_TEAM_ID,
 *        APPLE_PASS_CERT (base64 of signerCert.pem), APPLE_PASS_KEY (base64 of signerKey.pem),
 *        APPLE_PASS_KEY_PASSPHRASE (if the key has one), APPLE_WWDR_CERT (base64 PEM)
 *
 * Automatic updates: Wallet registers with our web service
 * (/api/wallet/apple/v1/...). When a streak/level/reward changes we send an
 * empty push through APNs; the iPhone then downloads the new pass. Fields with
 * a `changeMessage` show a lock-screen notification (e.g. reward unlocked).
 *
 * NOTE: built to Apple's PassKit docs; it needs real Apple certificates to
 * test end to end.
 */
import "server-only";
import { createHmac } from "node:crypto";
import http2 from "node:http2";
import { PKPass } from "passkit-generator";
import type { Cafe, Customer } from "../data";
import { cafeIconPng, cafeLogoStripPng } from "../images";
import { passData } from "./data";

const env = (k: string) => process.env[k];
const b64 = (k: string) => (env(k) ? Buffer.from(env(k)!, "base64") : null);

export function appleWalletConfigured(): boolean {
  return Boolean(env("APPLE_PASS_TYPE_ID") && env("APPLE_TEAM_ID") && env("APPLE_PASS_CERT") && env("APPLE_PASS_KEY") && env("APPLE_WWDR_CERT"));
}

export const passTypeId = () => env("APPLE_PASS_TYPE_ID") ?? "";

/** Per-pass secret Wallet sends back to us; derived, so nothing to store. */
export function passAuthToken(serial: string): string {
  const secret = env("SESSION_SECRET") ?? "dev-only-secret-do-not-use-in-production-0000";
  return createHmac("sha256", secret).update(`wallet:${serial}`).digest("hex");
}

function rgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

export async function buildApplePass(cafe: Cafe, c: Customer, origin: string): Promise<Buffer> {
  if (!appleWalletConfigured()) throw new Error("Apple Wallet is not configured");
  const d = await passData(cafe, c);
  const colors = cafe.brand.colors;
  const pass = {
    formatVersion: 1,
    passTypeIdentifier: passTypeId(),
    teamIdentifier: env("APPLE_TEAM_ID"),
    serialNumber: c.id,
    authenticationToken: passAuthToken(c.id),
    webServiceURL: `${origin}/api/wallet/apple`,
    organizationName: cafe.name,
    description: `${cafe.name} Rewards`,
    logoText: cafe.name,
    foregroundColor: rgb(colors.text),
    backgroundColor: rgb(colors.background),
    labelColor: rgb(colors.primary),
    sharingProhibited: true,
    storeCard: {
      headerFields: [{ key: "level", label: "LEVEL", value: `${d.levelIcon} ${d.level}`, changeMessage: "You're now %@!" }],
      primaryFields: [{ key: "streak", label: "STREAK", value: d.streak }],
      secondaryFields: [
        { key: "name", label: "MEMBER", value: d.firstName },
        { key: "saved", label: "TOTAL SAVED", value: d.saved },
        { key: "xp", label: "XP", value: d.xp },
      ],
      auxiliaryFields: [{ key: "rewards", label: "REWARDS READY", value: d.rewards, changeMessage: "🎁 Reward unlocked: %@" }],
      backFields: [
        { key: "next", label: "Next up", value: d.nextUp },
        { key: "how", label: "How to use", value: "Show this code at the counter to check in. Visit every week to keep your streak." },
        { key: "page", label: "Your rewards page", value: `${origin}/me/${c.publicToken}`, attributedValue: `<a href="${origin}/me/${c.publicToken}">Open</a>` },
        { key: "powered", label: "", value: "Powered by Streakify" },
      ],
    },
    barcodes: [{ format: "PKBarcodeFormatQR", message: d.qr, messageEncoding: "iso-8859-1", altText: "Scan at the counter" }],
  };
  const [icon, icon2, icon3, logo, logo2] = await Promise.all([
    cafeIconPng(cafe, 29, origin),
    cafeIconPng(cafe, 58, origin),
    cafeIconPng(cafe, 87, origin),
    cafeLogoStripPng(cafe, 1, origin),
    cafeLogoStripPng(cafe, 2, origin),
  ]);
  const pkpass = new PKPass(
    {
      "pass.json": Buffer.from(JSON.stringify(pass)),
      "icon.png": icon,
      "icon@2x.png": icon2,
      "icon@3x.png": icon3,
      "logo.png": logo,
      "logo@2x.png": logo2,
    },
    {
      wwdr: b64("APPLE_WWDR_CERT")!,
      signerCert: b64("APPLE_PASS_CERT")!,
      signerKey: b64("APPLE_PASS_KEY")!,
      signerKeyPassphrase: env("APPLE_PASS_KEY_PASSPHRASE"),
    },
  );
  return pkpass.getAsBuffer();
}

/** Tells iPhones holding these passes to fetch the latest version (APNs, empty payload). */
export async function pushApplePassUpdates(tokens: { pushToken: string; passTypeId: string }[]): Promise<void> {
  if (!tokens.length || !appleWalletConfigured()) return;
  const client = http2.connect("https://api.push.apple.com", { cert: b64("APPLE_PASS_CERT")!, key: b64("APPLE_PASS_KEY")!, passphrase: env("APPLE_PASS_KEY_PASSPHRASE") });
  try {
    await Promise.all(
      tokens.map(
        (t) =>
          new Promise<void>((resolve) => {
            const req = client.request({ ":method": "POST", ":path": `/3/device/${t.pushToken}`, "apns-topic": t.passTypeId, "content-type": "application/json" });
            req.on("response", (h) => {
              if (h[":status"] !== 200) console.warn(`[wallet] APNs ${h[":status"]} for a pass update`);
            });
            req.on("error", (e) => {
              console.warn("[wallet] APNs error", e.message);
              resolve();
            });
            req.on("close", () => resolve());
            req.end("{}");
          }),
      ),
    );
  } finally {
    client.close();
  }
}
