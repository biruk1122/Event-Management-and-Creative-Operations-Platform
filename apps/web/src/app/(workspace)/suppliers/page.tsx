import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { WorkSurface } from "@/components/ui/work-surface";

import { createServerApi } from "@/lib/api/server";
import { SuppliersScreen } from "@/features/suppliers";

export const metadata: Metadata = { title: "Suppliers" };

/**
 * Reading suppliers is gated by `supplier.read` at organization or
 * department scope - the same rule `SuppliersService` enforces: an
 * organization-scoped caller sees the shared directory and every
 * department's private entries, a department-scoped caller sees the shared
 * directory plus only its own department's. This server check is the first
 * gate; the client `SuppliersScreen` re-checks and keeps the grant fresh.
 */
const READ_KEY = "supplier.read";

export default async function SuppliersPage() {
  const api = createServerApi({ cookie: (await cookies()).toString() });
  const { data, response } = await api.GET("/api/v1/auth/me/permissions", {
    cache: "no-store",
  });
  if (response.status === 401) redirect("/login?next=%2Fsuppliers");
  if (!data) throw new Error("We could not check your permissions. Try again.");
  const allowed = data.grants.some(
    (grant) =>
      grant.permissionKey === READ_KEY &&
      (grant.scope === "ORGANIZATION" || grant.scope === "DEPARTMENT"),
  );

  return (
    <main className="@container mx-auto max-w-7xl px-5 py-5 sm:px-8">
      <WorkSurface
        title="Suppliers"
        description={
          allowed
            ? "Maintain the supplier directory used when recording an event's expenses."
            : undefined
        }
      >
        {allowed ? (
          <div>
            <SuppliersScreen />
          </div>
        ) : (
          <p role="alert" className="mt-4">
            You do not have access to this area.
          </p>
        )}
      </WorkSurface>
    </main>
  );
}
