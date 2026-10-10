import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";

import { createServerApi } from "@/lib/api/server";
import { TalentScreen } from "@/features/talent";

export const metadata: Metadata = { title: "Talent" };

/**
 * Reading talent profiles is gated by `talent.read` at organization scope -
 * the same rule `TalentService` enforces. This server check is the first
 * gate; the client `TalentScreen` re-checks and keeps the grant fresh.
 */
const READ_KEY = "talent.read";

export default async function TalentPage() {
  const api = createServerApi({ cookie: (await cookies()).toString() });
  const { data, response } = await api.GET("/api/v1/auth/me/permissions", {
    cache: "no-store",
  });
  if (response.status === 401) redirect("/login?next=%2Ftalent");
  if (!data) throw new Error("We could not check your permissions. Try again.");
  const allowed = data.grants.some(
    (grant) =>
      grant.permissionKey === READ_KEY && grant.scope === "ORGANIZATION",
  );

  return (
    <main className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
      <Link href="/" className="text-sm underline underline-offset-4">
        Back to home
      </Link>
      <h1 className="mt-4 text-xl font-semibold tracking-tight text-balance">
        Talent
      </h1>
      {allowed ? (
        <>
          <p className="text-muted-foreground mt-1 text-sm">
            Review talent profiles, create one, edit contact details and
            biography, move availability through its lifecycle, manage schedules
            and social links, assign a manager, and assign talent to events.
          </p>
          <div className="mt-6">
            <TalentScreen />
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
