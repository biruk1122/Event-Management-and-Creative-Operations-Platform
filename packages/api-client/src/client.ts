export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  code?: string;
  requestId?: string;
  errors?: ReadonlyArray<{
    field?: string;
    message: string;
  }>;
}

export interface ApiClientOptions {
  baseUrl: string;
  fetch?: typeof globalThis.fetch;
  getHeaders?: () => HeadersInit | Promise<HeadersInit>;
}

export class ApiProblemError extends Error {
  constructor(public readonly problem: ProblemDetails) {
    super(problem.detail ?? problem.title);
    this.name = "ApiProblemError";
  }
}

export interface ApiClient {
  request<TResponse>(path: string, init?: RequestInit): Promise<TResponse>;
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const request = options.fetch ?? globalThis.fetch;
  const baseUrl = options.baseUrl.replace(/\/$/, "");

  return {
    async request<TResponse>(
      path: string,
      init?: RequestInit,
    ): Promise<TResponse> {
      const configuredHeaders = await options.getHeaders?.();
      const headers = new Headers(configuredHeaders);

      new Headers(init?.headers).forEach((value, key) =>
        headers.set(key, value),
      );
      headers.set("accept", "application/json");

      const response = await request(`${baseUrl}/${path.replace(/^\//, "")}`, {
        ...init,
        credentials: "include",
        headers,
      });

      if (!response.ok) {
        const fallback: ProblemDetails = {
          type: "about:blank",
          title: response.statusText || "Request failed",
          status: response.status,
        };
        const problem = await response.json().catch(() => fallback);
        throw new ApiProblemError(problem as ProblemDetails);
      }

      if (response.status === 204) {
        return undefined as TResponse;
      }

      return (await response.json()) as TResponse;
    },
  };
}
