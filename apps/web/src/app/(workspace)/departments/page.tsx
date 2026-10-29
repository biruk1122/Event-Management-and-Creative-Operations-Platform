import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";

import { createServerApi } from "@/lib/api/server";
import { DepartmentsScreen } from "@/features/departments";
import { AdministrationSurface } from "@/components/ui/administration-surface";

export const metadata: Metadata = { title: "Departments" };

export default async function DepartmentsPage() {
  const api = createServerApi({ cookie: (await cookies()).toString() });
  const { data, response } = await api.GET("/api/v1/auth/me/permissions", {
    cache: "no-store",
  });
  if (response.status === 401) redirect("/login?next=%2Fdepartments");
  if (!data) throw new Error("We could not check your permissions. Try again.");
  const allowed = data.grants.some(
    (grant) =>
      grant.permissionKey === "department.read" &&
      (grant.scope === "ORGANIZATION" || grant.scope === "DEPARTMENT"),
  );

  return (
    <main className="@container mx-auto max-w-7xl px-5 py-8 sm:px-8">
      <Link href="/" className="text-sm underline underline-offset-4">
        Back to home
      </Link>
      <AdministrationSurface
        title="Departments"
        description={
          allowed
            ? "Create units, edit details, assign a manager, and manage status."
            : undefined
        }
      >
        {allowed ? (
          <DepartmentsScreen />
        ) : (
          <p role="alert" className="mt-6">
            You do not have access to this area.
          </p>
        )}
      </AdministrationSurface>
    </main>
  );
}
