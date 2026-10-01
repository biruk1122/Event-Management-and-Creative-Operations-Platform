import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";

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
    <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
      <Link href="/" className="text-sm underline underline-offset-4">
        Back to home
      </Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Reports</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Daily, weekly, and monthly work reports and review history.
      </p>
      <div className="mt-6">
        {readGrants.length ? (
          <ReportsScreen />
        ) : (
          <p role="alert">You do not have access to reports.</p>
        )}
      </div>
    </main>
  );
}
