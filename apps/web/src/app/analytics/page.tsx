import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AnalyticsWorkspace, analyticsAbilities } from "@/features/analytics";
import { createServerApi } from "@/lib/api/server";

export const metadata: Metadata = { title: "Management analytics" };

export default async function AnalyticsPage() {
  const api = createServerApi({ cookie: (await cookies()).toString() });
  const { data, response } = await api.GET("/api/v1/auth/me/permissions", {
    cache: "no-store",
  });
  if (response.status === 401) redirect("/login?next=%2Fanalytics");
  if (!data) throw new Error("We could not check your permissions. Try again.");
  const allowed = analyticsAbilities(data);
  const departmentOnly =
    !allowed.tasks && !allowed.employees && allowed.departments;
  const departmentGrant = data.grants.some(
    (grant) =>
      grant.permissionKey === "analytics.department_performance.read" &&
      ["ORGANIZATION", "MANAGEMENT"].includes(grant.scope),
  );
  return (
    <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
      <Link href="/" className="text-sm underline underline-offset-4">
        Back to home
      </Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">
        Management analytics
      </h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Transparent work counts and delivery rates. No employee ranking or
        inferred ROI.
      </p>
      <div className="mt-6">
        <AnalyticsWorkspace
          allowed={allowed}
          scopeLabel={
            departmentOnly && !departmentGrant
              ? "Your current department only (no department means no rows)"
              : "Per-measure server-authorized scope; department measures may be restricted to your current department"
          }
        />
      </div>
    </main>
  );
}
