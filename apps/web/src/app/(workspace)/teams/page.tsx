import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createServerApi } from "@/lib/api/server";
import { TeamsScreen } from "@/features/teams";
import { AdministrationSurface } from "@/components/ui/administration-surface";

export const metadata: Metadata = { title: "Teams" };

export default async function TeamsPage() {
  const api = createServerApi({ cookie: (await cookies()).toString() });
  const { data, response } = await api.GET("/api/v1/auth/me/permissions", {
    cache: "no-store",
  });
  if (response.status === 401) redirect("/login?next=%2Fteams");
  if (!data) throw new Error("We could not check your permissions. Try again.");
  const allowed = data.grants.some(
    (grant) =>
      grant.permissionKey === "team.read" &&
      (grant.scope === "ORGANIZATION" || grant.scope === "DEPARTMENT"),
  );

  return (
    <main className="@container mx-auto max-w-7xl px-5 py-5 sm:px-8">
      <AdministrationSurface
        title="Teams"
        description={
          allowed
            ? "Create department-owned teams, edit details, assign a manager, manage members, and manage status."
            : undefined
        }
      >
        {allowed ? (
          <TeamsScreen />
        ) : (
          <p role="alert" className="mt-4">
            You do not have access to this area.
          </p>
        )}
      </AdministrationSurface>
    </main>
  );
}
