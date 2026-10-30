import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { WorkSurface } from "@/components/ui/work-surface";

import { createServerApi } from "@/lib/api/server";
import { MarketingWorkspaceScreen } from "@/features/marketing-workspace";
import {
  canEnterMarketingWorkspace,
  marketingWorkspaceContext,
} from "@/features/marketing-workspace/lib/marketing-workspace-access";

export const metadata: Metadata = { title: "Marketing" };

/**
 * The dedicated Marketing Department Workspace: Super Admin always enters
 * (organization-wide oversight); a Department Manager or Team Member enters
 * only when their own active department is Marketing. This server check is
 * the first gate; the client `MarketingWorkspaceScreen` re-checks and keeps
 * the grant fresh, exactly like every other workspace screen.
 */
export default async function MarketingPage() {
  const api = createServerApi({ cookie: (await cookies()).toString() });
  const { data, response } = await api.GET("/api/v1/auth/me/permissions", {
    cache: "no-store",
  });
  if (response.status === 401) redirect("/login?next=%2Fmarketing");
  if (!data) throw new Error("We could not check your permissions. Try again.");

  const allowed = canEnterMarketingWorkspace(data);
  const context = allowed ? marketingWorkspaceContext(data) : null;

  return (
    <main className="@container mx-auto max-w-7xl px-5 py-5 sm:px-8">
      <WorkSurface
        title={context?.title ?? "Marketing"}
        description={context?.description}
      >
        {allowed ? (
          <div>
            <MarketingWorkspaceScreen />
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
