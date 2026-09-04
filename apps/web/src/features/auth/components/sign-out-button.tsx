"use client";

import { useState } from "react";
import { LoaderCircle, LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";

import { signOut as defaultSignOut } from "../api/sign-out";

interface SignOutButtonProps {
  /** Injected by the caller; tests pass a stub. Defaults to the placeholder. */
  onSignOut?: () => Promise<void>;
}

export function SignOutButton({ onSignOut }: SignOutButtonProps) {
  const run = onSignOut ?? defaultSignOut;
  const [pending, setPending] = useState(false);

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={pending}
      aria-busy={pending}
      onClick={() => {
        setPending(true);
        void run().finally(() => {
          setPending(false);
        });
      }}
    >
      {pending ? (
        <LoaderCircle aria-hidden="true" className="animate-spin" />
      ) : (
        <LogOut aria-hidden="true" />
      )}
      {pending ? "Signing out…" : "Sign out"}
    </Button>
  );
}
