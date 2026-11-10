import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createServerApi } from "@/lib/api/server";
import { UserDetailsScreen } from "@/features/users/components/user-details-screen";

export const metadata: Metadata = { title: "User details" };

/**
 * Reading a user is gated by `user.read` at organization scope, the same rule
 * the list and the API enforce. The client screen re-checks access.
 */
export default async function UserDetailsPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const api = createServerApi({ cookie: (await cookies()).toString() });
  const { data, response } = await api.GET("/api/v1/auth/me/permissions", {
    cache: "no-store",
  });
  if (response.status === 401) redirect(`/login?next=%2Fusers%2F${userId}`);
  if (!data) throw new Error("We could not check your permissions. Try again.");
  const allowed = data.grants.some(
    (grant) =>
      grant.permissionKey === "user.read" && grant.scope === "ORGANIZATION",
  );

  return (
    <main className="@container mx-auto max-w-5xl px-5 py-8 sm:px-8">
      {allowed ? (
        <UserDetailsScreen userId={userId} />
      ) : (
        <p role="alert">You do not have access to this area.</p>
      )}
    </main>
  );
}
