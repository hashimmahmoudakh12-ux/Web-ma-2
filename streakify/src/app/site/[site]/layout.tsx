/**
 * Layout for every café page. Loads the café from the host name, applies
 * its colors, and adds the small "Powered by Streakify" footer.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CafeTheme } from "@/components/CafeTheme";
import { PoweredBy } from "@/components/PoweredBy";
import { resolveCafe } from "@/lib/tenant";

export async function generateMetadata({ params }: LayoutProps<"/site/[site]">): Promise<Metadata> {
  const cafe = await resolveCafe((await params).site);
  return cafe ? { title: `${cafe.name} Rewards`, robots: { index: false } } : {};
}

async function Themed({ params, children }: LayoutProps<"/site/[site]">) {
  const cafe = await resolveCafe((await params).site);
  if (!cafe) notFound();
  return (
    <CafeTheme brand={cafe.brand}>
      <div className="flex flex-1 flex-col">{children}</div>
      <PoweredBy />
    </CafeTheme>
  );
}

export default function CafeLayout(props: LayoutProps<"/site/[site]">) {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-neutral-950" />}>
      <Themed {...props} />
    </Suspense>
  );
}
