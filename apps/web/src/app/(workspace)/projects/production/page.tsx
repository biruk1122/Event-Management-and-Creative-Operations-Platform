import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { WorkSurface } from "@/components/ui/work-surface";

import { createServerApi } from "@/lib/api/server";
import { ProductionsScreen } from "@/features/productions";

export const metadata: Metadata = { title: "Production projects" };

export default async function ProductionProjectsPage() {
  const api = createServerApi({ cookie: (await cookies()).toString() });
  const { data, response } = await api.GET("/api/v1/auth/me/permissions", {
    cache: "no-store",
  });
  if (response.status === 401) redirect("/login?next=%2Fprojects%2Fproduction");
  if (!data) throw new Error("We could not check your permissions. Try again.");
  const allowed = data.grants.some(
    (grant) =>
      grant.permissionKey === "project.read" &&
      (grant.scope === "ORGANIZATION" || grant.scope === "DEPARTMENT"),
  );

  return (
    <main className="@container mx-auto max-w-352 px-5 py-5 sm:px-8">
      <nav aria-label="Breadcrumb" className="text-sm">
        <Link href="/projects" className="underline underline-offset-4">
          Projects
        </Link>
        <span aria-hidden="true" className="mx-2">
          /
        </span>
        <span aria-current="page">Production</span>
      </nav>
      <WorkSurface
        title="Production projects"
        description="Plan production work, schedules, teams, talent, and connected workspace activity."
      >
        <div>
          {allowed ? (
            <ProductionsScreen />
          ) : (
            <p role="alert">You do not have access to this area.</p>
          )}
        </div>
      </WorkSurface>
    </main>
  );
}
