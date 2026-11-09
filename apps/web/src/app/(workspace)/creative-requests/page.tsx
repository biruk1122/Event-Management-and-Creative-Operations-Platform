import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { WorkSurface } from "@/components/ui/work-surface";

import { createServerApi } from "@/lib/api/server";
import { CreativeRequestsScreen } from "@/features/creative-requests/components/creative-requests-screen";

export const metadata: Metadata = { title: "Creative requests" };

/**
 * Creative requests (EVE-232), for the Production side and Super Admin. Any
 * scope of `creative_request.read` opens the page; the API decides which
 * requests each caller sees and what they may do.
 */
const READ_KEY = "creative_request.read";

export default async function CreativeRequestsPage() {
  const api = createServerApi({ cookie: (await cookies()).toString() });
  const { data, response } = await api.GET("/api/v1/auth/me/permissions", {
    cache: "no-store",
  });
  if (response.status === 401) redirect("/login?next=%2Fcreative-requests");
  if (!data) throw new Error("We could not check your permissions. Try again.");
  const allowed = data.grants.some((grant) => grant.permissionKey === READ_KEY);

  return (
    <main className="@container mx-auto max-w-7xl px-5 py-5 sm:px-8">
      <WorkSurface
        title="Creative requests"
        description={
          allowed
            ? "Posters, videos and other creative work requested between departments."
            : undefined
        }
      >
        {allowed ? (
          <CreativeRequestsScreen />
        ) : (
          <p role="alert" className="mt-4">
            You do not have access to this area.
          </p>
        )}
      </WorkSurface>
    </main>
  );
}
