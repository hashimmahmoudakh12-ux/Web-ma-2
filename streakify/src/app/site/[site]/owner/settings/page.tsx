/** Owner settings: edit reward levels, rewards, rules and the café's look. */
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { resolveCafe } from "@/lib/tenant";
import { cafeBase } from "@/lib/urls";
import { ownerCafe } from "../actions";
import { SettingsForm } from "./SettingsForm";

async function Settings({ params }: PageProps<"/site/[site]/owner/settings">) {
  await connection();
  const { site } = await params;
  if (!(await resolveCafe(site))) notFound();
  const base = await cafeBase();
  const cafe = await ownerCafe(site);
  if (!cafe) redirect(`${base}/owner`);
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-6">
      <Link href={`${base}/owner`} className="text-brand-muted">‹ Back to dashboard</Link>
      <h1 className="text-2xl font-bold">Rewards & look</h1>
      <SettingsForm siteKey={site} program={cafe.program} brand={cafe.brand} currency={cafe.currency} />
    </main>
  );
}

export default function Page(props: PageProps<"/site/[site]/owner/settings">) {
  return (
    <Suspense fallback={<div className="flex-1" />}>
      <Settings {...props} />
    </Suspense>
  );
}
