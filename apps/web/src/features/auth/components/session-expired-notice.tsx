import Link from "next/link";
import { Clock } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SessionExpiredNoticeProps {
  /** The path the user was on when the session ended. */
  next?: string;
}

/**
 * Shown when an authenticated request fails because the session ended
 * (sign-out elsewhere, revocation, or deactivation). It never redirects on its
 * own; the user chooses to return to sign in.
 */
export function SessionExpiredNotice({ next }: SessionExpiredNoticeProps) {
  const href = next
    ? ({ pathname: "/login", query: { next } } as const)
    : ({ pathname: "/login" } as const);

  return (
    <div className="space-y-4 text-center">
      <span className="bg-muted text-muted-foreground mx-auto flex size-10 items-center justify-center rounded-xl">
        <Clock aria-hidden="true" className="size-5" />
      </span>
      <div className="space-y-1">
        <h2 className="font-semibold">Your session has ended</h2>
        <p className="text-muted-foreground text-sm leading-6">
          For your security you were signed out. Sign in again to pick up where
          you left off.
        </p>
      </div>
      <Link
        href={href}
        className={cn(buttonVariants({ size: "lg" }), "w-full")}
      >
        Back to sign in
      </Link>
    </div>
  );
}
