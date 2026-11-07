import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { CafeTheme } from "@/components/CafeTheme";
import { currentSession } from "@/lib/auth";
import { streakifyBrand } from "@/lib/streakify-brand";
import { SetPasswordForm } from "./SetPasswordForm";

export const metadata: Metadata = { title: "Set your password · Streakify", robots: { index: false } };

async function Inner() {
  await connection();
  const s = await currentSession();
  if (!s) redirect("/login?expired=1");
  return <SetPasswordForm email={s.user.email} role={s.user.role} />;
}

export default function Page() {
  return (
    <CafeTheme brand={streakifyBrand}>
      <main className="flex min-h-dvh items-center justify-center px-4">
        <Suspense>
          <Inner />
        </Suspense>
      </main>
    </CafeTheme>
  );
}
