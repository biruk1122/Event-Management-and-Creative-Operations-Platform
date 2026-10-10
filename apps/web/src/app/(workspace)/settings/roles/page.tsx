import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerApi } from "@/lib/api/server";
import { RolesScreen } from "@/features/rbac/components/roles-screen";

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
    <main className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
      <Link href="/" className="text-sm underline underline-offset-4">
        Back to home
      </Link>
      <h1 className="mt-4 text-xl font-semibold tracking-tight text-balance">
        Roles and permissions
      </h1>
      {allowed ? (
        <>
          <p className="text-muted-foreground mt-1 text-sm">
            Create configurable roles and manage their permission grants.
          </p>
          <div className="mt-6">
            <RolesScreen />
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
