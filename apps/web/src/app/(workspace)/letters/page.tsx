import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { WorkSurface } from "@/components/ui/work-surface";

import { createServerApi } from "@/lib/api/server";
import { LettersScreen } from "@/features/letters";
import { canAccessAdministrationDocuments } from "@/features/letters/lib/letter-access";

export const metadata: Metadata = { title: "Letters" };

/**
 * Administration: Letters (EMP-02). Super Admin always enters; a
 * Department Manager enters only when their own active department is HR &
 * Executive Officer. This server check is the first gate (UX only); the
 * real boundary is `LettersService.requireLetterAccess` on every API route.
 */
export default async function LettersPage() {
  const api = createServerApi({ cookie: (await cookies()).toString() });
  const { data, response } = await api.GET("/api/v1/auth/me/permissions", {
    cache: "no-store",
  });
  if (response.status === 401) redirect("/login?next=%2Fletters");
  if (!data) throw new Error("We could not check your permissions. Try again.");

  const allowed = canAccessAdministrationDocuments(data);

  return (
    <main className="@container mx-auto max-w-7xl px-5 py-5 sm:px-8">
      <WorkSurface {...(allowed ? {} : { title: "Letters" })}>
        {allowed ? (
          <LettersScreen />
        ) : (
          <p role="alert" className="mt-4">
            You do not have access to this area.
          </p>
        )}
      </WorkSurface>
    </main>
  );
}
