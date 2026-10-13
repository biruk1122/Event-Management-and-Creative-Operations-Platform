import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { WorkSurface } from "@/components/ui/work-surface";

import { createServerApi } from "@/lib/api/server";
import { DiscussScreen } from "@/features/discuss";

export const metadata: Metadata = { title: "Channels" };

interface ChannelsPageProps {
  params: Promise<{ channelId?: string[] }>;
}

export default async function ChannelsPage({ params }: ChannelsPageProps) {
  const { channelId } = await params;
  const api = createServerApi({ cookie: (await cookies()).toString() });
  const { data, response } = await api.GET("/api/v1/auth/me/permissions", {
    cache: "no-store",
  });
  if (response.status === 401) redirect("/login?next=%2Fdiscuss%2Fchannels");
  if (!data) throw new Error("We could not check your permissions. Try again.");
  const allowed = data.grants.some(
    (grant) => grant.permissionKey === "channel.participate",
  );

  return (
    <main className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
      <Link href="/" className="text-sm underline underline-offset-4">
        Back to home
      </Link>
      <WorkSurface
        title="Channels"
        description={
          allowed
            ? "Public and private channels for a workspace, department, or team."
            : undefined
        }
      >
        {allowed ? (
          <div>
            <DiscussScreen
              kind="channel"
              initialConversationId={channelId?.[0] ?? null}
            />
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
