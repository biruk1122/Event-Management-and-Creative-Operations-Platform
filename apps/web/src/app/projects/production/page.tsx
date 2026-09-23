import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";

import { createServerApi } from "@/lib/api/server";
import { ProductionsBoard } from "@/features/productions";

export const metadata: Metadata = { title: "Production projects" };

export default async function ProductionProjectsPage() {
  const api = createServerApi({ cookie: (await cookies()).toString() });
  const { data, response } = await api.GET("/api/v1/auth/me/permissions", {
    cache: "no-store",
  });
  if (response.status === 401) redirect("/login?next=%2Fprojects%2Fproduction");
  if (!data) throw new Error("We could not check your permissions. Try again.");
  const can = (key: string) =>
    data.grants.some(
      (grant) => grant.permissionKey === key && grant.scope === "ORGANIZATION",
    );

  return (
    <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
      <nav aria-label="Breadcrumb" className="text-sm">
        <Link href="/projects" className="underline underline-offset-4">
          Projects
        </Link>
        <span aria-hidden="true" className="mx-2">
          /
        </span>
        <span aria-current="page">Production</span>
      </nav>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">
        Production projects
      </h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Plan production work, schedules, teams, talent, and connected workspace
        activity.
      </p>
      <div className="mt-6">
        <ProductionsBoard
          productions={[]}
          state={can("project.read") ? "ready" : "denied"}
          canCreate={can("project.create")}
          canUpdate={can("project.update")}
          canTransition={can("project.transition_status")}
          canAssign={can("project.assign")}
          canDelete={can("project.delete")}
        />
      </div>
    </main>
  );
}
