import { serverEnvironment } from "@/env/server";
import { fetchBackendLiveness } from "@/lib/api/backend-health";

export async function GET(): Promise<Response> {
  try {
    const backend = await fetchBackendLiveness(
      serverEnvironment.API_INTERNAL_URL,
    );

    return Response.json(
      { backend, checks: { api: "up" }, status: "ready" },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return Response.json(
      {
        code: "API_UNAVAILABLE",
        detail: "The backend API is not ready to accept requests.",
        status: 503,
        title: "Service Unavailable",
        type: "about:blank",
      },
      {
        headers: {
          "cache-control": "no-store",
          "content-type": "application/problem+json",
        },
        status: 503,
      },
    );
  }
}
