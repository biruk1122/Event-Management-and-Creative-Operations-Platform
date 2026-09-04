"use client";

import { useState } from "react";
import { LoaderCircle, LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";

interface SignOutButtonProps {
  /** Revokes the session; the caller handles navigation afterwards. */
  onSignOut: () => Promise<void>;
}

export function SignOutButton({ onSignOut }: SignOutButtonProps) {
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
        void onSignOut().finally(() => {
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
