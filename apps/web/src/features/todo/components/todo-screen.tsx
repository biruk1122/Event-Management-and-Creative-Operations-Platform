"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { useCurrentAccess } from "@/features/auth/api/access-queries";
import type { ConnectRealtime } from "@/features/realtime";

import { TodoManager } from "./todo-manager";

export interface TodoScreenProps {
  /** Testing seam, forwarded to `TodoManager`. */
  connect?: ConnectRealtime;
}

export function TodoScreen({ connect }: TodoScreenProps = {}) {
  const access = useCurrentAccess();
  const allowed =
    access.data?.grants.some((grant) => grant.permissionKey === "todo.read") ??
    false;

  if (access.isPending) return <p role="status">Checking to-do access…</p>;
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
        <p>Your session expired. Sign in again to recover your to-dos.</p>
        <Link
          href="/login?next=%2Ftodos"
          className="text-sm underline underline-offset-4"
        >
          Sign in
        </Link>
      </div>
    );
  if (!allowed)
    return <p role="alert">You do not have access to your to-do list.</p>;
  return (
    <TodoManager
      key={access.data.userId}
      access={access.data}
      {...(connect ? { connect } : {})}
    />
  );
}
