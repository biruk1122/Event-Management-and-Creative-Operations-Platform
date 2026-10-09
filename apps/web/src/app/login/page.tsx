import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthShell, Login } from "@/features/auth";
import { entryAccess } from "@/features/auth/lib/entry-access";

export const metadata: Metadata = {
  title: { absolute: "Sign in | Lela Creative Management" },
};

export default async function LoginPage(props: PageProps<"/login">) {
  if (await entryAccess()) redirect("/dashboard");
  const { next } = await props.searchParams;
  const redirectTo = typeof next === "string" ? next : undefined;

  return (
    <AuthShell
      title="Welcome back"
      description="Sign in to your Lela work account to continue."
    >
      <Login {...(redirectTo ? { redirectTo } : {})} />
    </AuthShell>
  );
}
