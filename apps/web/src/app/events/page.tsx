import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";

import { createServerApi } from "@/lib/api/server";
import {
  EventsManager,
  listAssignableTeams,
  listAssignableUsers,
  listEvents,
} from "@/features/events";

export const metadata: Metadata = { title: "Events" };

/**
 * Reading events is gated by `event.read` at organization scope - the same
 * rule `EventsService` enforces. EVT-05 (EVE-85) moves the data fetching to
 * real API calls; this slice checks the grant and renders the fixture-backed
 * management surface.
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
      grant.permissionKey === READ_KEY && grant.scope === "ORGANIZATION",
  );

  const [firstPage, users, teams] = await Promise.all([
    listEvents({ page: 1 }),
    listAssignableUsers(),
    listAssignableTeams(),
  ]);

  return (
    <main className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
      <Link href="/" className="text-sm underline underline-offset-4">
        Back to home
      </Link>
      <h1 className="mt-4 text-xl font-semibold tracking-tight text-balance">
        Events
      </h1>
      {allowed ? (
        <>
          <p className="text-muted-foreground mt-1 text-sm">
            Review events, create one, edit its details, move it through its
            lifecycle, assign a manager and teams, and set an optional budget.
          </p>
          <div className="mt-6">
            <EventsManager
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
