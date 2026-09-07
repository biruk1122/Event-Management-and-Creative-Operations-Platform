import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";

import { createServerApi } from "@/lib/api/server";
import {
  DepartmentsManager,
  listAssignableManagers,
  listDepartments,
} from "@/features/departments";

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

  const [firstPage, managers] = await Promise.all([
    listDepartments({ page: 1 }),
    listAssignableManagers(),
  ]);

  return (
    <main className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
      <Link href="/" className="text-sm underline underline-offset-4">
        Back to home
      </Link>
      <h1 className="mt-4 text-xl font-semibold tracking-tight text-balance">
        Departments
      </h1>
      {allowed ? (
        <>
          <p className="text-muted-foreground mt-1 text-sm">
            Create units, edit details, assign a manager, and manage status.
          </p>
          <div className="mt-6">
            <DepartmentsManager initialPage={firstPage} managers={managers} />
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
