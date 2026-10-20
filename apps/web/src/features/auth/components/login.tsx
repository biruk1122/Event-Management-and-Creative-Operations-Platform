"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { readCsrfToken } from "@/lib/api/csrf";

import { useLoginMutation } from "../api/auth-queries";
import type { LoginOutcome } from "../lib/login-outcome";
import type { LoginValues } from "../lib/login-schema";
import { loginDestination } from "../api/login-destination";
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
  const [recovering, setRecovering] = useState(true);
  useEffect(() => {
    let active = true;
    const restore = async () => {
      if (!readCsrfToken()) return;
      const { browserSession } = await import("@/lib/api/browser");
      const user = await browserSession.recover();
      if (user && active) {
        const destination = await loginDestination(redirectTo);
        if (active) {
          router.replace(destination);
          router.refresh();
        }
      }
    };
    void restore()
      .catch(() => {})
      .finally(() => {
        if (active) setRecovering(false);
      });
    return () => {
      active = false;
    };
  }, [redirectTo, router]);

  async function handleSubmit(values: LoginValues): Promise<LoginOutcome> {
    const { outcome } = await mutation.mutateAsync(values);

    if (outcome.status === "success") {
      router.replace(await loginDestination(redirectTo));
      router.refresh();
    }

    return outcome;
  }

  if (recovering)
    return (
      <p
        role="status"
        className="text-muted-foreground py-8 text-center text-sm"
      >
        Restoring your session…
      </p>
    );
  return (
    <LoginForm
      onSubmit={handleSubmit}
      {...(redirectTo ? { redirectTo } : {})}
    />
  );
}
