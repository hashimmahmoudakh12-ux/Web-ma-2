/** Add a café: step-by-step wizard (admin only). */
import { connection } from "next/server";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { requireAdmin } from "@/lib/auth";
import { getRepo } from "@/lib/data";
import { sanaaCafe, starterProgram } from "@/lib/demo/cafes";
import { parseProgram } from "@/lib/program";
import { ADMIN_NAV } from "../../shared";
import { Wizard, type Template } from "./Wizard";

async function Inner() {
  await connection();
  const s = await requireAdmin();
  const cafes = await getRepo().listCafes();
  const templates: Template[] = [
    { id: "starter", label: "Streakify starter template", program: parseProgram(starterProgram), colors: null },
    { id: "sanaa", label: "Yemeni café template (Sana'a style)", program: parseProgram(sanaaCafe.program), colors: null },
    ...cafes.map((c) => ({ id: `cafe:${c.id}`, label: `Duplicate ${c.name}`, program: c.program, colors: c.brand.colors, timezone: c.timezone })),
  ];
  return (
    <AppShell nav={ADMIN_NAV} who={s.user.email}>
      <h1 className="text-3xl font-bold tracking-tight">Add a café</h1>
      <Wizard templates={templates} />
    </AppShell>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-dvh" />}>
      <Inner />
    </Suspense>
  );
}
