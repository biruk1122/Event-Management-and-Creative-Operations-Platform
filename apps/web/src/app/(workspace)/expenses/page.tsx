import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { WorkSurface } from "@/components/ui/work-surface";

import { createServerApi } from "@/lib/api/server";
import { ExpensesScreen } from "@/features/expenses";

export const metadata: Metadata = { title: "Expenses" };

/**
 * Reading expenses is gated by `expense.read` at organization or department
 * scope - the same rule `ExpensesService` enforces (EOM-01): an
 * organization-scoped caller sees every expense, a department-scoped caller
 * sees only their own department's. This server check is the first gate;
 * the client `ExpensesScreen` re-checks and keeps the grant fresh.
 */
const READ_KEY = "expense.read";

export default async function ExpensesPage() {
  const api = createServerApi({ cookie: (await cookies()).toString() });
  const { data, response } = await api.GET("/api/v1/auth/me/permissions", {
    cache: "no-store",
  });
  if (response.status === 401) redirect("/login?next=%2Fexpenses");
  if (!data) throw new Error("We could not check your permissions. Try again.");
  const allowed = data.grants.some(
    (grant) =>
      grant.permissionKey === READ_KEY &&
      (grant.scope === "ORGANIZATION" || grant.scope === "DEPARTMENT"),
  );

  return (
    <main className="@container mx-auto max-w-7xl px-5 py-8 sm:px-8">
      <Link href="/" className="text-sm underline underline-offset-4">
        Back to home
      </Link>
      <WorkSurface
        title="Expenses"
        description={
          allowed
            ? "Track an event's planned and actual costs, submit them for approval, and read the approval history."
            : undefined
        }
      >
        {allowed ? (
          <div>
            <ExpensesScreen />
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
