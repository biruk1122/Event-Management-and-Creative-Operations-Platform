"use client";

import { useRouter } from "next/navigation";

import { useLogoutMutation } from "../api/auth-queries";
import { SignOutButton } from "./sign-out-button";

/**
 * Connects the sign-out control to the real API. The local session is unusable
 * once the button is pressed, so the user is sent to `/login` whether or not
 * the revocation request itself succeeds.
 */
export function SignOut() {
  const router = useRouter();
  const mutation = useLogoutMutation();

  async function handleSignOut(): Promise<void> {
    try {
      await mutation.mutateAsync();
    } catch {
      // The local session is unusable regardless of the response; fall
      // through to navigation.
    }
    router.replace("/login");
    router.refresh();
  }

  return <SignOutButton onSignOut={handleSignOut} />;
}
