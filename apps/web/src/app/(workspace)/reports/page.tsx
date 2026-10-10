import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
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
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-8 sm:py-8">
      <Link href="/" className="text-sm underline underline-offset-4">
        Back to home
      </Link>
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
