import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";

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
    <main className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
      <Link href="/" className="text-sm underline underline-offset-4">
        Back to home
      </Link>
      <h1 className="mt-4 text-xl font-semibold tracking-tight text-balance">
        Direct messages
      </h1>
      {allowed ? (
        <>
          <p className="text-muted-foreground mt-1 text-sm">
            Message one person directly, or start a group.
          </p>
          <div className="mt-6">
            <DiscussScreen
              kind="dm"
              initialConversationId={conversationId?.[0] ?? null}
            />
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
