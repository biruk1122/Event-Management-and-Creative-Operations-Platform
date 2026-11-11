"use client";

import { useQuery } from "@tanstack/react-query";
import type { components } from "@event-platform/api-client";
import { browserApi } from "@/lib/api/browser";
import { hydrationSafe, useHydrated } from "@/lib/hydration-safe-query";

export type CurrentAccess = components["schemas"]["CurrentAccessResponse"];
export const accessKey = ["auth", "access"] as const;

export function canManageRoles(
  access: CurrentAccess | null | undefined,
  permission: string,
) {
  return (
    access?.grants.some(
      (grant) =>
        grant.permissionKey === permission && grant.scope === "ORGANIZATION",
    ) ?? false
  );
}

export function useCurrentAccess() {
  const hydrated = useHydrated();
  const result = useQuery({
    queryKey: accessKey,
    queryFn: async ({ signal }): Promise<CurrentAccess | null> => {
      const { data, response } = await browserApi.GET(
        "/api/v1/auth/me/permissions",
        { signal, cache: "no-store" },
      );
      if (response.status === 401) return null;
      if (!data)
        throw new Error("We could not check your permissions. Try again.");
      return data;
    },
    staleTime: 30_000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    retry: false,
  });
  return hydrationSafe(result, hydrated);
}
