"use client";

import { useRouter } from "next/navigation";

import { useLoginMutation } from "../api/auth-queries";
import type { LoginOutcome } from "../lib/login-outcome";
import type { LoginValues } from "../lib/login-schema";
import { safeRedirect } from "../lib/safe-redirect";
import { LoginForm } from "./login-form";

interface LoginProps {
  /** Raw `?next` value from the URL; validated before use. */
  redirectTo?: string;
}

/**
 * Connects the sign-in form to the real API: runs the login mutation, seeds the
 * session cache on success (in the mutation), and moves the user on to the
 * validated destination.
 */
export function Login({ redirectTo }: LoginProps) {
  const router = useRouter();
  const mutation = useLoginMutation();

  async function handleSubmit(values: LoginValues): Promise<LoginOutcome> {
    const { outcome } = await mutation.mutateAsync(values);

    if (outcome.status === "success") {
      router.replace(safeRedirect(redirectTo));
      router.refresh();
    }

    return outcome;
  }

  return (
    <LoginForm
      onSubmit={handleSubmit}
      {...(redirectTo ? { redirectTo } : {})}
    />
  );
}
