import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { WorkSurface } from "@/components/ui/work-surface";

import { createServerApi } from "@/lib/api/server";
import { SharedRecordsScreen } from "@/features/shared-records";

export const metadata: Metadata = { title: "Shared with Me" };

/**
 * Every authenticated active employee reaches this page - there is no
 * management-permission gate, unlike Letters/Documents. This server check
 * only confirms the session itself; `SharedRecordsScreen`'s API calls are
 * what the baseline `share.read` grant actually authorizes.
 */
export default async function SharedWithMePage() {
  const api = createServerApi({ cookie: (await cookies()).toString() });
  const { response } = await api.GET("/api/v1/auth/me/permissions", {
    cache: "no-store",
  });
  if (response.status === 401) redirect("/login?next=%2Fshared-with-me");

  return (
    <main className="@container mx-auto max-w-7xl px-5 py-5 sm:px-8">
      <WorkSurface
        title="Shared with Me"
        description="Letters and documents explicitly shared with you."
      >
        <SharedRecordsScreen />
      </WorkSurface>
    </main>
  );
}
