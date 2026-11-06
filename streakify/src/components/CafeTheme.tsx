/**
 * Wraps a café's pages and turns its brand into CSS variables, so every
 * Tailwind "brand-*" class picks up that café's look.
 *
 * scheme="auto"  follows the phone's light/dark setting (customer app, owner)
 * scheme="dark"  always the café's own dark colors (counter tablet)
 */
import type { CSSProperties, ReactNode } from "react";
import type { Brand } from "@/lib/brand";
import { ensureContrast, mix, readableOn } from "@/lib/color";

export function themeVars(brand: Brand) {
  const c = brand.colors;
  const lightBg = mix("#f5f5f7", c.primary, 0.05);
  const lightPrimary = ensureContrast(c.primary, "#ffffff", 3);
  return {
    dark: { bg: c.background, surface: c.surface, primary: c.primary, onPrimary: c.onPrimary, text: c.text, muted: c.muted },
    light: { bg: lightBg, surface: "#ffffff", primary: lightPrimary, onPrimary: readableOn(lightPrimary), text: "#1c1c1e", muted: "#6e6e73" },
  };
}

const css = (v: ReturnType<typeof themeVars>["dark"]) =>
  `--brand-bg:${v.bg};--brand-surface:${v.surface};--brand-primary:${v.primary};--brand-on-primary:${v.onPrimary};--brand-text:${v.text};--brand-muted:${v.muted};`;

export function CafeTheme({ brand, children, scheme = "auto" }: { brand: Brand; children: ReactNode; scheme?: "auto" | "dark" }) {
  const t = themeVars(brand);
  const style = scheme === "dark" ? ({ colorScheme: "dark" } as CSSProperties) : undefined;
  return (
    <div data-scheme={scheme} style={style} className="cafe-theme flex min-h-dvh flex-col bg-brand-bg text-brand-text">
      <style>{`
        .cafe-theme{${css(t.dark)}color-scheme:dark}
        @media (prefers-color-scheme: light){.cafe-theme[data-scheme="auto"]{${css(t.light)}color-scheme:light}}
      `}</style>
      {children}
    </div>
  );
}

/** Forces the café's dark colors even in light mode (used on the counter tablet). */
export function ForceDark({ brand }: { brand: Brand }) {
  const t = themeVars(brand);
  return <style>{`@media (prefers-color-scheme: light){.cafe-theme[data-scheme="auto"]{${css(t.dark)}color-scheme:dark}}`}</style>;
}
