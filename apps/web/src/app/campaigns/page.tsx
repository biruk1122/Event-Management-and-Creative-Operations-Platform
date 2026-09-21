import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";

import { createServerApi } from "@/lib/api/server";
import { CampaignsScreen } from "@/features/campaigns";

export const metadata: Metadata = { title: "Campaigns" };

/**
 * Reading campaigns is gated by `campaign.read` at organization scope - the
 * same rule `CampaignsService` enforces. This server check is the first gate;
 * the client `CampaignsScreen` re-checks and keeps the grant fresh.
 */
const READ_KEY = "campaign.read";

export default async function CampaignsPage() {
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
    <main className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
      <Link href="/" className="text-sm underline underline-offset-4">
        Back to home
      </Link>
      <h1 className="mt-4 text-xl font-semibold tracking-tight text-balance">
        Campaigns
      </h1>
      {allowed ? (
        <>
          <p className="text-muted-foreground mt-1 text-sm">
            Review marketing and promotion campaigns, create one, edit its
            details, move it through its lifecycle, plan its activities and
            track progress, assign a manager and teams, and set an optional
            budget.
          </p>
          <div className="mt-6">
            <CampaignsScreen />
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
