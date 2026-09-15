"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { useCurrentAccess } from "@/features/auth/api/access-queries";

import { TasksManager } from "./tasks-manager";

const LOGIN_HREF = "/login?next=%2Ftasks";

function canReadTasks(
  access: ReturnType<typeof useCurrentAccess>["data"],
): boolean {
  return (
    access?.grants.some((grant) => grant.permissionKey === "task.read") ?? false
  );
}

export function TasksScreen() {
  const access = useCurrentAccess();

  if (access.isPending) {
    return <p role="status">Checking permissions...</p>;
  }

  if (access.isError) {
    return (
      <div role="alert" className="space-y-2">
        <p>{access.error.message}</p>
        <Button variant="outline" onClick={() => void access.refetch()}>
          Check permissions again
        </Button>
      </div>
    );
  }

  if (access.data === null) {
    return (
      <div role="alert" className="space-y-2">
        <p>Your session expired. Your unsaved input is kept in this tab.</p>
        <Link
          href={LOGIN_HREF}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm underline underline-offset-4"
        >
          Sign in in another tab
        </Link>
        <Button variant="outline" onClick={() => void access.refetch()}>
          I have signed in
        </Button>
      </div>
    );
  }

  if (!canReadTasks(access.data)) {
    return <p role="alert">You do not have access to tasks.</p>;
  }

  return <TasksManager access={access.data} />;
}
