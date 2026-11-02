import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { TaskDetailsScreen } from "@/features/tasks";
import { createServerApi } from "@/lib/api/server";

export const metadata: Metadata = { title: "Task" };

export default async function TaskDetailsPage({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  const { taskId } = await params;
  const next = encodeURIComponent(`/tasks/${taskId}`);
  const api = createServerApi({ cookie: (await cookies()).toString() });
  const { data, response } = await api.GET("/api/v1/auth/me/permissions", {
    cache: "no-store",
  });
  if (response.status === 401) redirect(`/login?next=${next}`);
  if (!data) throw new Error("We could not check your permissions. Try again.");
  const allowed = data.grants.some(
    (grant) => grant.permissionKey === "task.read",
  );

  return (
    <main className="@container mx-auto max-w-352 px-5 py-8 sm:px-8">
      <div className="mt-6">
        {allowed ? (
          <TaskDetailsScreen taskId={taskId} />
        ) : (
          <p role="alert">You do not have access to tasks.</p>
        )}
      </div>
    </main>
  );
}
