import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { WorkSurface } from "@/components/ui/work-surface";

import { createServerApi } from "@/lib/api/server";
import { DocumentsScreen } from "@/features/documents";
import { canAccessAdministrationDocuments } from "@/features/letters/lib/letter-access";

export const metadata: Metadata = { title: "Documents" };

/**
 * Administration: Documents (EMP-02). Super Admin always enters; a
 * Department Manager enters only when their own active department is HR &
 * Executive Officer. This server check is the first gate (UX only); the
 * real boundary is `DocumentsService.requireDocumentAccess` on every API
 * route.
 */
export default async function DocumentsPage() {
  const api = createServerApi({ cookie: (await cookies()).toString() });
  const { data, response } = await api.GET("/api/v1/auth/me/permissions", {
    cache: "no-store",
  });
  if (response.status === 401) redirect("/login?next=%2Fdocuments");
  if (!data) throw new Error("We could not check your permissions. Try again.");

  const allowed = canAccessAdministrationDocuments(data);

  return (
    <main className="@container mx-auto max-w-7xl px-5 py-5 sm:px-8">
      <WorkSurface {...(allowed ? {} : { title: "Documents" })}>
        {allowed ? (
          <DocumentsScreen />
        ) : (
          <p role="alert" className="mt-4">
            You do not have access to this area.
          </p>
        )}
      </WorkSurface>
    </main>
  );
}
