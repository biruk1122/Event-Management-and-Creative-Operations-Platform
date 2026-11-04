import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createServerApi } from "@/lib/api/server";
import { TalentProfilePage } from "@/features/talent/components/talent-profile-page";
import { canReadTalent } from "@/features/talent/lib/talent-access";

export const metadata: Metadata = { title: "Talent profile" };

/**
 * A talent profile is read under the same rule as the directory: organization
 * `talent.read`, or the Production Manager. The client page re-checks it and
 * the API decides every record and field.
 */
export default async function TalentProfileRoute({
  params,
  searchParams,
}: {
  params: Promise<{ talentId: string }>;
  searchParams: Promise<{ assign?: string | string[] }>;
}) {
  const { talentId } = await params;
  // The directory's Assign button opens the profile with ?assign=1.
  const { assign } = await searchParams;
  const path = `/talent/${talentId}`;
  const api = createServerApi({ cookie: (await cookies()).toString() });
  const { data, response } = await api.GET("/api/v1/auth/me/permissions", {
    cache: "no-store",
  });
  if (response.status === 401) {
    redirect(`/login?next=${encodeURIComponent(path)}`);
  }
  if (!data) throw new Error("We could not check your permissions. Try again.");

  return (
    <main className="@container mx-auto max-w-7xl px-5 py-8 sm:px-8">
      {canReadTalent(data) ? (
        <TalentProfilePage talentId={talentId} assignOnLoad={assign === "1"} />
      ) : (
        <p role="alert">You do not have access to this area.</p>
      )}
    </main>
  );
}
