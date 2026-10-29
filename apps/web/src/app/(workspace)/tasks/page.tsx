import type { Metadata } from "next";
import { cookies } from "next/headers";
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
    <main className="@container mx-auto max-w-352 px-5 py-5 sm:px-8">
      <div>
        {allowed ? (
          <TasksScreen />
        ) : (
          <p role="alert">You do not have access to tasks.</p>
        )}
      </div>
    </main>
  );
}
