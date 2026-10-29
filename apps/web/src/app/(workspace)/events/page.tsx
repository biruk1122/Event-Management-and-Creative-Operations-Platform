import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { WorkSurface } from "@/components/ui/work-surface";

import { createServerApi } from "@/lib/api/server";
import { EventsScreen } from "@/features/events";

export const metadata: Metadata = { title: "Events" };

/**
 * Reading events is gated by `event.read` at organization or department
 * scope - the same rule `EventsService` enforces since EOM-01 made events
 * department-scoped (an organization-scoped caller sees every event, a
 * department-scoped caller sees only their own department's). This server
 * check is the first gate; the client `EventsScreen` re-checks and keeps the
 * grant fresh.
 */
const READ_KEY = "event.read";

export default async function EventsPage() {
  const api = createServerApi({ cookie: (await cookies()).toString() });
  const { data, response } = await api.GET("/api/v1/auth/me/permissions", {
    cache: "no-store",
  });
  if (response.status === 401) redirect("/login?next=%2Fevents");
  if (!data) throw new Error("We could not check your permissions. Try again.");
  const allowed = data.grants.some(
    (grant) =>
      grant.permissionKey === READ_KEY &&
      (grant.scope === "ORGANIZATION" || grant.scope === "DEPARTMENT"),
  );

  return (
    <main className="@container mx-auto max-w-7xl px-5 py-5 sm:px-8">
      <WorkSurface
        title="Events"
        description={
          allowed
            ? "Review events, create one, edit its details, move it through its lifecycle, assign a manager and teams, and set an optional budget."
            : undefined
        }
      >
        {allowed ? (
          <div>
            <EventsScreen />
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
