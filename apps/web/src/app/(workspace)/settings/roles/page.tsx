import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerApi } from "@/lib/api/server";
import { RolesScreen } from "@/features/rbac/components/roles-screen";
import { AdministrationSurface } from "@/components/ui/administration-surface";

export const metadata: Metadata = { title: "Roles and permissions" };

export default async function RolesPage() {
  const api = createServerApi({ cookie: (await cookies()).toString() });
  const { data, response } = await api.GET("/api/v1/auth/me/permissions", {
    cache: "no-store",
  });
  if (response.status === 401) redirect("/login?next=%2Fsettings%2Froles");
  if (!data) throw new Error("We could not check your permissions. Try again.");
  const allowed = data.grants.some(
    (grant) =>
      grant.permissionKey === "role.read" && grant.scope === "ORGANIZATION",
  );
  return (
    <main className="@container mx-auto max-w-7xl px-5 py-8 sm:px-8">
      <Link href="/" className="text-sm underline underline-offset-4">
        Back to home
      </Link>
      <AdministrationSurface
        title="Roles and permissions"
        description={
          allowed
            ? "Create configurable roles and manage their permission grants."
            : undefined
        }
      >
        {allowed ? (
          <RolesScreen />
        ) : (
          <p role="alert" className="mt-6">
            You do not have access to this area.
          </p>
        )}
      </AdministrationSurface>
    </main>
  );
}
