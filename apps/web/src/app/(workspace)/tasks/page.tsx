import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { TasksScreen } from "@/features/tasks";
import { createServerApi } from "@/lib/api/server";

export const metadata: Metadata = { title: "Tasks" };

export default async function TasksPage() {
  const api = createServerApi({ cookie: (await cookies()).toString() });
  const { data, response } = await api.GET("/api/v1/auth/me/permissions", {
    cache: "no-store",
  });
  if (response.status === 401) redirect("/login?next=%2Ftasks");
  if (!data) throw new Error("We could not check your permissions. Try again.");
  const allowed = data.grants.some(
    (grant) => grant.permissionKey === "task.read",
  );

  return (
    <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
      <Link href="/" className="text-sm underline underline-offset-4">
        Back to home
      </Link>
      <div className="mt-6">
        {allowed ? (
          <TasksScreen />
        ) : (
          <p role="alert">You do not have access to tasks.</p>
        )}
      </div>
    </main>
  );
}
