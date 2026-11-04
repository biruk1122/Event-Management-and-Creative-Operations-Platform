import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerApi } from "@/lib/api/server";
import { TalentScreen } from "@/features/talent";
import { TalentPageHero } from "@/features/talent/components/talent-page-hero";
import {
  canReadTalent,
  talentAbilities,
} from "@/features/talent/lib/talent-access";

export const metadata: Metadata = { title: "Talent" };

export default async function TalentPage() {
  const api = createServerApi({ cookie: (await cookies()).toString() });
  const { data, response } = await api.GET("/api/v1/auth/me/permissions", {
    cache: "no-store",
  });
  if (response.status === 401) redirect("/login?next=%2Ftalent");
  if (!data) throw new Error("We could not check your permissions. Try again.");
  // Organization `talent.read`, or the Production Manager who sees the
  // directory with contact details masked. The client screen re-checks it.
  const allowed = canReadTalent(data);
  const manages = talentAbilities(data).canCreate;

  return (
    <main className="@container mx-auto max-w-7xl space-y-6 px-5 py-8 sm:px-8">
      {allowed ? (
        <>
          <TalentPageHero
            description={
              manages
                ? "Manage your talent profiles, track assignments, and keep all talent information in one place."
                : "Review talent profiles and assign talent to your department's events and productions. Contact details are masked."
            }
          />
          <TalentScreen />
        </>
      ) : (
        <p role="alert">You do not have access to this area.</p>
      )}
    </main>
  );
}
