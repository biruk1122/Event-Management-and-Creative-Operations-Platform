import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";

import { createServerApi } from "@/lib/api/server";
import {
  listAssignableTeams,
  listAssignableUsers,
  listWorkspaces,
  WorkspacesManager,
} from "@/features/workspaces";

export const metadata: Metadata = { title: "Workspaces" };

/**
 * The connected workspace has no permission key of its own. Reading one is
 * gated by the owning module's read key (event / project / campaign), so this
 * management surface opens for anyone who can read at least one of them.
 */
const READ_KEYS = ["event.read", "project.read", "campaign.read"];

export default async function WorkspacesPage() {
  const api = createServerApi({ cookie: (await cookies()).toString() });
  const { data, response } = await api.GET("/api/v1/auth/me/permissions", {
    cache: "no-store",
  });
  if (response.status === 401) redirect("/login?next=%2Fworkspaces");
  if (!data) throw new Error("We could not check your permissions. Try again.");
  const allowed = data.grants.some(
    (grant) =>
      READ_KEYS.includes(grant.permissionKey) &&
      (grant.scope === "ORGANIZATION" || grant.scope === "DEPARTMENT"),
  );

  const [firstPage, users, teams] = await Promise.all([
    listWorkspaces({ page: 1 }),
    listAssignableUsers(),
    listAssignableTeams(),
  ]);

  return (
    <main className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
      <Link href="/" className="text-sm underline underline-offset-4">
        Back to home
      </Link>
      <h1 className="mt-4 text-xl font-semibold tracking-tight text-balance">
        Workspaces
      </h1>
      {allowed ? (
        <>
          <p className="text-muted-foreground mt-1 text-sm">
            Review connected workspaces, create a workspace root, assign a
            manager, and manage its teams and participants.
          </p>
          <div className="mt-6">
            <WorkspacesManager
              initialPage={firstPage}
              assignableUsers={users}
              assignableTeams={teams}
            />
          </div>
        </>
      ) : (
        <p role="alert" className="mt-6">
          You do not have access to this area.
        </p>
      )}
    </main>
  );
}
