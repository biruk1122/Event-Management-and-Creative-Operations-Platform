import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerApi } from "@/lib/api/server";
import { AdministrationSurface } from "@/components/ui/administration-surface";
import { SmsAdminScreen } from "@/features/sms/components/sms-admin-screen";

export const metadata: Metadata = { title: "SMS administration" };

export default async function SmsSettingsPage() {
  const api = createServerApi({ cookie: (await cookies()).toString() });
  const { data, response } = await api.GET("/api/v1/auth/me/permissions", {
    cache: "no-store",
  });
  if (response.status === 401) redirect("/login?next=%2Fsettings%2Fsms");
  if (!data) throw new Error("We could not check your permissions. Try again.");
  const holds = (key: string) =>
    data.grants.some(
      (grant) => grant.permissionKey === key && grant.scope === "ORGANIZATION",
    );
  const canRead = holds("settings.read");
  const canUpdate = holds("settings.update");

  return (
    <main className="@container mx-auto max-w-7xl px-5 py-8 sm:px-8">
      <AdministrationSurface
        title="SMS"
        description={
          canRead
            ? "Switch SMS delivery and its categories, check the provider connection, and review message history."
            : undefined
        }
      >
        {canRead ? (
          <SmsAdminScreen canUpdate={canUpdate} />
        ) : (
          <p role="alert" className="mt-6">
            You do not have access to this area.
          </p>
        )}
      </AdministrationSurface>
    </main>
  );
}
