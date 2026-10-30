import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { WorkSurface } from "@/components/ui/work-surface";

import { createServerApi } from "@/lib/api/server";
import { PartnersScreen } from "@/features/partners";

export const metadata: Metadata = { title: "Partners" };

/**
 * Reading partners is gated by `partner.read` at any scope - the same rule
 * `PartnersService` enforces: an organization-scoped caller (Super Admin)
 * sees every partner, a department-scoped caller (the Marketing Manager)
 * sees their own department's, and a self-scoped caller (a Team Member)
 * sees only the relationships they own. This server check is the first
 * gate; the client `PartnersScreen` re-checks and keeps the grant fresh.
 */
const READ_KEY = "partner.read";

export default async function PartnersPage() {
  const api = createServerApi({ cookie: (await cookies()).toString() });
  const { data, response } = await api.GET("/api/v1/auth/me/permissions", {
    cache: "no-store",
  });
  if (response.status === 401) redirect("/login?next=%2Fpartners");
  if (!data) throw new Error("We could not check your permissions. Try again.");
  const allowed = data.grants.some((grant) => grant.permissionKey === READ_KEY);

  return (
    <main className="@container mx-auto max-w-7xl px-5 py-5 sm:px-8">
      <WorkSurface
        title="Partners"
        description={
          allowed
            ? "Sponsors, media, and strategic-partner relationships under development."
            : undefined
        }
      >
        {allowed ? (
          <div>
            <PartnersScreen />
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
