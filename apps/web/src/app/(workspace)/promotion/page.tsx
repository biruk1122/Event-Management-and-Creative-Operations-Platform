import type { Metadata } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { WorkSurface } from "@/components/ui/work-surface";

import { createServerApi } from "@/lib/api/server";
import { PromotionWorkspaceScreen } from "@/features/promotion-workspace";
import {
  canEnterPromotionWorkspace,
  promotionWorkspaceContext,
} from "@/features/promotion-workspace/lib/promotion-workspace-access";

export const metadata: Metadata = { title: "Promotion" };

/**
 * The Promotional Manager workspace (EVE-229). Super Admin, Promotion
 * department staff and the Marketing Manager (read-only oversight) enter;
 * everyone else is refused. This server check is the first gate; the client
 * screen re-checks and keeps the grant fresh, like every other workspace.
 */
export default async function PromotionPage() {
  const api = createServerApi({ cookie: (await cookies()).toString() });
  const { data, response } = await api.GET("/api/v1/auth/me/permissions", {
    cache: "no-store",
  });
  if (response.status === 401) redirect("/login?next=%2Fpromotion");
  if (!data) throw new Error("We could not check your permissions. Try again.");

  const allowed = canEnterPromotionWorkspace(data);
  const context = allowed ? promotionWorkspaceContext(data) : null;

  return (
    <main className="@container mx-auto max-w-7xl px-5 py-5 sm:px-8">
      <WorkSurface
        title={context?.title ?? "Promotion"}
        description={context?.description}
      >
        {allowed ? (
          <Suspense fallback={<p role="status">Checking permissions…</p>}>
            <PromotionWorkspaceScreen />
          </Suspense>
        ) : (
          <p role="alert" className="mt-4">
            You do not have access to this area.
          </p>
        )}
      </WorkSurface>
    </main>
  );
}
