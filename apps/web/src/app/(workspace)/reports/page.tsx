import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";

import { ReportsScreen } from "@/features/reports";
import { createServerApi } from "@/lib/api/server";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage() {
  const api = createServerApi({ cookie: (await cookies()).toString() });
  const { data, response } = await api.GET("/api/v1/auth/me/permissions", {
    cache: "no-store",
  });
  if (response.status === 401) redirect("/login?next=%2Freports");
  if (!data) throw new Error("We could not check your permissions. Try again.");

  const readGrants = data.grants.filter(
    (grant) => grant.permissionKey === "report.read",
  );

  return (
    <main className="@container mx-auto max-w-352 space-y-6 px-4 py-4 sm:px-8 sm:py-5">
      <PageHeader
        title="Reports"
        description="Daily, weekly, and monthly work reports and review history."
      />
      <div>
        {readGrants.length ? (
          <ReportsScreen />
        ) : (
          <p role="alert">You do not have access to reports.</p>
        )}
      </div>
    </main>
  );
}
