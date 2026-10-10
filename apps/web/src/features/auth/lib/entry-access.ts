import "server-only";

import { cookies } from "next/headers";
import { createServerApi } from "@/lib/api/server";

/** Check the authoritative session; cookie presence alone is not authentication. */
export async function entryAccess() {
  const api = createServerApi({ cookie: (await cookies()).toString() });
  const { data, response } = await api.GET("/api/v1/auth/me/permissions", {
    cache: "no-store",
  });
  if (response.status === 401) return null;
  if (!data) throw new Error("We could not check your session. Try again.");
  return data;
}
