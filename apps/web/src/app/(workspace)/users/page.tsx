import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Users } from "lucide-react";

import { createServerApi } from "@/lib/api/server";
import { UsersScreen } from "@/features/users";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage() {
  const api = createServerApi({ cookie: (await cookies()).toString() });
  const { data, response } = await api.GET("/api/v1/auth/me/permissions", {
    cache: "no-store",
  });
  if (response.status === 401) redirect("/login?next=%2Fusers");
  if (!data) throw new Error("We could not check your permissions. Try again.");
  const allowed = data.grants.some(
    (grant) =>
      grant.permissionKey === "user.read" && grant.scope === "ORGANIZATION",
  );

  return (
    <main className="@container mx-auto max-w-7xl px-5 py-8 sm:px-8">
      <div className="space-y-6">
        <header className="border-border from-accent/60 to-card flex items-center gap-4 rounded-2xl border bg-linear-to-r px-6 py-5 shadow-xs">
          <span
            aria-hidden="true"
            className="bg-primary text-primary-foreground flex size-14 shrink-0 items-center justify-center rounded-2xl shadow-sm"
          >
            <Users className="size-7" />
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
            {allowed ? (
              <p className="text-muted-foreground mt-1 text-sm">
                Create accounts, edit profiles, manage status, and assign roles.
              </p>
            ) : null}
          </div>
        </header>

        {allowed ? (
          <UsersScreen />
        ) : (
          <p role="alert">You do not have access to this area.</p>
        )}
      </div>
    </main>
  );
}
