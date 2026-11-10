import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createServerApi } from "@/lib/api/server";
import { DiscussScreen } from "@/features/discuss";

export const metadata: Metadata = { title: "Direct messages" };

interface DirectMessagesPageProps {
  params: Promise<{ conversationId?: string[] }>;
}

export default async function DirectMessagesPage({
  params,
}: DirectMessagesPageProps) {
  const { conversationId } = await params;
  const api = createServerApi({ cookie: (await cookies()).toString() });
  const { data, response } = await api.GET("/api/v1/auth/me/permissions", {
    cache: "no-store",
  });
  if (response.status === 401) redirect("/login?next=%2Fdiscuss%2Fdm");
  if (!data) throw new Error("We could not check your permissions. Try again.");
  const allowed = data.grants.some(
    (grant) => grant.permissionKey === "conversation.read",
  );

  return (
    <main className="@container mx-auto max-w-7xl px-4 py-4 sm:px-6 sm:py-5">
      {allowed ? (
        <DiscussScreen
          kind="dm"
          initialConversationId={conversationId?.[0] ?? null}
        />
      ) : (
        <p role="alert">You do not have access to this area.</p>
      )}
    </main>
  );
}
