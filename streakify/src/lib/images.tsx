/**
 * Generates PNG images on the fly in the café's colors: home-screen app icons,
 * iPhone splash screens and Wallet pass images. Uses the café logo when it
 * exists, otherwise the café's initials.
 */
import "server-only";
import { ImageResponse } from "next/og";
import type { Cafe } from "./data";

function initials(name: string) {
  return name
    .replace(/[^\p{L}\p{N} ]/gu, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

async function logoDataUrl(cafe: Cafe, origin: string): Promise<string | null> {
  const url = cafe.brand.logoUrl;
  if (!url) return null;
  try {
    const abs = url.startsWith("http") ? url : `${origin}${url}`;
    const res = await fetch(abs, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "image/png";
    if (!type.startsWith("image/")) return null;
    return `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
  } catch {
    return null;
  }
}

/** Square app icon. */
export async function cafeIconPng(cafe: Cafe, size: number, origin: string): Promise<Buffer> {
  const logo = await logoDataUrl(cafe, origin);
  const c = cafe.brand.colors;
  const img = new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: c.background }}>
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
          <img src={logo} style={{ width: "72%", height: "72%", objectFit: "contain" }} />
        ) : (
          <div style={{ fontSize: size * 0.42, fontWeight: 700, color: c.primary, letterSpacing: -size * 0.01 }}>{initials(cafe.name)}</div>
        )}
      </div>
    ),
    { width: size, height: size },
  );
  return Buffer.from(await img.arrayBuffer());
}

/** Wide logo strip for Wallet passes (max 160x50 points). */
export async function cafeLogoStripPng(cafe: Cafe, scale: number, origin: string): Promise<Buffer> {
  const logo = await logoDataUrl(cafe, origin);
  const w = 160 * scale;
  const h = 50 * scale;
  const img = new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center" }}>
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
          <img src={logo} style={{ height: "100%", objectFit: "contain" }} />
        ) : (
          <div style={{ fontSize: 30 * scale, fontWeight: 700, color: cafe.brand.colors.primary }}>{initials(cafe.name)}</div>
        )}
      </div>
    ),
    { width: w, height: h },
  );
  return Buffer.from(await img.arrayBuffer());
}

/** iPhone launch screen shown while the home-screen app opens. */
export async function cafeSplashPng(cafe: Cafe, width: number, height: number, origin: string): Promise<Buffer> {
  const logo = await logoDataUrl(cafe, origin);
  const c = cafe.brand.colors;
  const s = Math.min(width, height);
  const img = new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: c.background }}>
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
          <img src={logo} style={{ width: s * 0.4, height: s * 0.4, objectFit: "contain" }} />
        ) : (
          <div style={{ fontSize: s * 0.18, fontWeight: 700, color: c.primary }}>{initials(cafe.name)}</div>
        )}
        <div style={{ marginTop: s * 0.05, fontSize: s * 0.05, color: c.text }}>{cafe.name}</div>
      </div>
    ),
    { width, height },
  );
  return Buffer.from(await img.arrayBuffer());
}
