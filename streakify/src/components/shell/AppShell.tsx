/**
 * Frame for the admin area and owner dashboard: Streakify branding, frosted
 * top bar, light/dark automatically.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { CafeTheme } from "@/components/CafeTheme";
import { streakifyBrand } from "@/lib/streakify-brand";
import { signOutAction } from "@/app/(streakify)/auth-actions";
import { StreakifyWordmark } from "./StreakifyMark";

export function AppShell({
  children,
  nav = [],
  who,
  banner,
}: {
  children: ReactNode;
  nav?: { href: string; label: string }[];
  who?: string;
  banner?: ReactNode;
}) {
  return (
    <CafeTheme brand={streakifyBrand}>
      <header className="glass sticky top-0 z-30 border-b border-brand-text/5">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-6">
            <Link href="/">
              <StreakifyWordmark />
            </Link>
            <nav className="hidden gap-1 sm:flex">
              {nav.map((n) => (
                <Link key={n.href} href={n.href} className="rounded-lg px-3 py-1.5 text-sm text-brand-muted hover:bg-brand-surface hover:text-brand-text">
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            {who && <span className="hidden text-brand-muted sm:inline">{who}</span>}
            <form action={signOutAction}>
              <button className="pressable rounded-lg bg-brand-surface px-3 py-1.5">Sign out</button>
            </form>
          </div>
        </div>
        {banner}
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 py-6">{children}</main>
    </CafeTheme>
  );
}
