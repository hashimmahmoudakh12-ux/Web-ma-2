/**
 * streakify.com/login — the ONE sign-in page for you (admin) and café owners.
 * Customers never sign in: they use the counter tablet and their personal link.
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { CafeTheme } from "@/components/CafeTheme";
import { currentSession, getAuth } from "@/lib/auth";
import { streakifyBrand } from "@/lib/streakify-brand";
import { LoginCard } from "./LoginCard";

export const metadata: Metadata = { title: "Sign in · Streakify", robots: { index: false } };

async function Login({ searchParams }: PageProps<"/login">) {
  await connection();
  const step = (await searchParams).step;
  const s = await currentSession();
  const needsMfa = Boolean(s && s.user.role === "admin" && getAuth().supportsMfa && s.mfaEnrolled && s.aal !== "aal2");
  if (s && !needsMfa) redirect(s.user.role === "admin" ? "/admin" : "/dashboard");
  return <LoginCard initialStep={needsMfa || step === "mfa" ? (needsMfa ? "mfa" : "password") : "password"} demoMode={getAuth().kind === "local"} />;
}

export default function LoginPage(props: PageProps<"/login">) {
  return (
    <CafeTheme brand={streakifyBrand}>
      <main className="flex min-h-dvh items-center justify-center px-4 py-10">
        <Suspense>
          <Login {...props} />
        </Suspense>
      </main>
    </CafeTheme>
  );
}
