import type { Metadata } from "next";

import { AuthShell, LoginForm } from "@/features/auth";

export const metadata: Metadata = {
  title: "Sign in",
};

export default async function LoginPage(props: PageProps<"/login">) {
  const { next } = await props.searchParams;
  const redirectTo = typeof next === "string" ? next : undefined;

  return (
    <AuthShell
      title="Sign in to Nexo Operations"
      description="Use your work account to continue."
    >
      <LoginForm {...(redirectTo ? { redirectTo } : {})} />
    </AuthShell>
  );
}
