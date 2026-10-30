"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { useCurrentAccess } from "@/features/auth/api/access-queries";

import { attendanceAbilities } from "../lib/attendance-access";
import { ExceptionReviewManager } from "./exception-review-manager";

export function ExceptionReviewScreen() {
  const access = useCurrentAccess();

  if (access.isPending) return <p role="status">Checking access…</p>;
  if (access.isError)
    return (
      <div role="alert" className="space-y-2">
        <p>{access.error.message}</p>
        <Button variant="outline" onClick={() => void access.refetch()}>
          Check access again
        </Button>
      </div>
    );
  if (access.data === null)
    return (
      <div role="alert" className="space-y-2">
        <p>Your session expired. Sign in again.</p>
        <Link
          href="/login?next=%2Fattendance%2Fexceptions"
          className="text-sm underline underline-offset-4"
        >
          Sign in
        </Link>
      </div>
    );
  if (!attendanceAbilities(access.data).canReviewExceptions)
    return <p role="alert">You do not have access to exception review.</p>;
  return (
    <ExceptionReviewManager key={access.data.userId} access={access.data} />
  );
}
