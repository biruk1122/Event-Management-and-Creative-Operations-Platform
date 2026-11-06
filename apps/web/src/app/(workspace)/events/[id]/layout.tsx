import type { Metadata } from "next";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { EventWorkspaceShell } from "@/features/events";
import { createServerApi } from "@/lib/api/server";

export const metadata: Metadata = { title: "Event workspace" };

const READ_KEY = "event.read";

/**
 * Every workspace tab sits under this layout. It applies the listing's first
 * gate, `event.read` at organization or department scope. The API then decides
 * whether this caller may see this particular event.
 */
export default async function EventWorkspaceLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const api = createServerApi({ cookie: (await cookies()).toString() });
  const { data, response } = await api.GET("/api/v1/auth/me/permissions", {
    cache: "no-store",
  });
  if (response.status === 401) {
    redirect(`/login?next=${encodeURIComponent(`/events/${id}`)}`);
  }
  if (!data) throw new Error("We could not check your permissions. Try again.");
  const allowed = data.grants.some(
    (grant) =>
      grant.permissionKey === READ_KEY &&
      (grant.scope === "ORGANIZATION" || grant.scope === "DEPARTMENT"),
  );

  return (
    <main className="@container mx-auto max-w-7xl px-5 py-8 sm:px-8">
      {allowed ? (
        <EventWorkspaceShell eventId={id}>{children}</EventWorkspaceShell>
      ) : (
        <p role="alert">You do not have access to this area.</p>
      )}
    </main>
  );
}
