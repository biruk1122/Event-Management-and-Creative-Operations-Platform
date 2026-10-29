import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { WorkSurface } from "@/components/ui/work-surface";

import { createServerApi } from "@/lib/api/server";
import { CampaignsScreen } from "@/features/campaigns";

export const metadata: Metadata = { title: "Campaigns" };

/**
 * Reading campaigns is gated by `campaign.read` at organization scope - the
 * same rule `CampaignsService` enforces. This server check is the first gate;
 * the client `CampaignsScreen` re-checks and keeps the grant fresh.
 */
const READ_KEY = "campaign.read";

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string | string[] }>;
}) {
  const { type } = await searchParams;
  const initialType =
    type === "MARKETING" || type === "PROMOTION" ? type : null;
  const api = createServerApi({ cookie: (await cookies()).toString() });
  const { data, response } = await api.GET("/api/v1/auth/me/permissions", {
    cache: "no-store",
  });
  if (response.status === 401) redirect("/login?next=%2Fcampaigns");
  if (!data) throw new Error("We could not check your permissions. Try again.");
  const allowed = data.grants.some(
    (grant) =>
      grant.permissionKey === READ_KEY && grant.scope === "ORGANIZATION",
  );

  return (
    <main className="@container mx-auto max-w-7xl px-5 py-8 sm:px-8">
      <Link href="/" className="text-sm underline underline-offset-4">
        Back to home
      </Link>
      <WorkSurface
        title="Campaigns"
        description={
          allowed
            ? "Review marketing and promotion campaigns, create one, edit its details, move it through its lifecycle, plan its activities and track progress, assign a manager and teams, and set an optional budget."
            : undefined
        }
      >
        {allowed ? (
          <div>
            <CampaignsScreen initialType={initialType} />
          </div>
        ) : (
          <p role="alert" className="mt-6">
            You do not have access to this area.
          </p>
        )}
      </WorkSurface>
    </main>
  );
}
