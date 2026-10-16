import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { WorkSurface } from "@/components/ui/work-surface";

import { createServerApi } from "@/lib/api/server";
import { ProjectsScreen } from "@/features/projects";

export const metadata: Metadata = { title: "Projects" };

/**
 * Reading projects is gated by `project.read` at organization scope - the
 * same rule `ProjectsService` enforces. This server check is the first
 * gate; the client `ProjectsScreen` re-checks and keeps the grant fresh.
 */
const READ_KEY = "project.read";

export default async function ProjectsPage() {
  const api = createServerApi({ cookie: (await cookies()).toString() });
  const { data, response } = await api.GET("/api/v1/auth/me/permissions", {
    cache: "no-store",
  });
  if (response.status === 401) redirect("/login?next=%2Fprojects");
  if (!data) throw new Error("We could not check your permissions. Try again.");
  const allowed = data.grants.some(
    (grant) =>
      grant.permissionKey === READ_KEY && grant.scope === "ORGANIZATION",
  );

  return (
    <main className="@container mx-auto max-w-7xl px-5 py-8 sm:px-8">
      <Link href="/" className="text-sm underline underline-offset-4">
        Back to home
      </Link>
      <WorkSurface
        title="Projects"
        description={
          allowed
            ? "Review projects, create one, edit its details, move it through its lifecycle, assign a manager and teams, and relate it to an event."
            : undefined
        }
      >
        {allowed ? (
          <>
            <Link
              href="/projects/production"
              className="mt-3 inline-block text-sm underline underline-offset-4"
            >
              View production projects
            </Link>
            <div className="mt-6">
              <ProjectsScreen />
            </div>
          </>
        ) : (
          <p role="alert" className="mt-6">
            You do not have access to this area.
          </p>
        )}
      </WorkSurface>
    </main>
  );
}
