/**
 * Wraps a café's pages and turns its brand colors into CSS variables,
 * so every Tailwind "brand-*" class picks up that café's look.
 */
import type { CSSProperties, ReactNode } from "react";
import type { Brand } from "@/lib/brand";

export function CafeTheme({ brand, children }: { brand: Brand; children: ReactNode }) {
  const c = brand.colors;
  const style = {
    "--brand-bg": c.background,
    "--brand-surface": c.surface,
    "--brand-primary": c.primary,
    "--brand-on-primary": c.onPrimary,
    "--brand-text": c.text,
    "--brand-muted": c.muted,
    background: c.background,
    color: c.text,
  } as CSSProperties;
  return (
    <div style={style} className="flex min-h-dvh flex-col">
      {children}
    </div>
  );
}
