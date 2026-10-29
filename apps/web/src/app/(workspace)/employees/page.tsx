import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdministrationSurface } from "@/components/ui/administration-surface";

import { createServerApi } from "@/lib/api/server";
import { EmployeesScreen } from "@/features/employees";
import { canAccessEmployeeManagement } from "@/features/employees/lib/employee-access";

export const metadata: Metadata = { title: "Employees" };

/**
 * Employee Management (EMP-01): Super Admin always enters; a Department
 * Manager enters only when their own active department is HR & Executive
 * Officer. This server check is the first gate (UX only); the real
 * boundary is `EmployeesService.requireEmployeeAccess` on every API route,
 * enforced regardless of what this page renders.
 */
export default async function EmployeesPage() {
  const api = createServerApi({ cookie: (await cookies()).toString() });
  const { data, response } = await api.GET("/api/v1/auth/me/permissions", {
    cache: "no-store",
  });
  if (response.status === 401) redirect("/login?next=%2Femployees");
  if (!data) throw new Error("We could not check your permissions. Try again.");

  const allowed = canAccessEmployeeManagement(data);

  return (
    <main className="@container mx-auto max-w-7xl px-5 py-5 sm:px-8">
      <AdministrationSurface
        title="Employees"
        description={
          allowed
            ? "Register employees, edit their HR records, manage employment status, and review compensation."
            : undefined
        }
      >
        {allowed ? (
          <EmployeesScreen />
        ) : (
          <p role="alert" className="mt-4">
            You do not have access to this area.
          </p>
        )}
      </AdministrationSurface>
    </main>
  );
}
