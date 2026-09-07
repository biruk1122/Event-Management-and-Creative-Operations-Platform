import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  authKeys,
  useCurrentUser,
  useLoginMutation,
  useLogoutMutation,
} from "./auth-queries";
import type { AuthUser } from "./auth-gateway";

const { login, logout, fetchCurrentUser } = vi.hoisted(() => ({
  login: vi.fn(),
  logout: vi.fn(),
  fetchCurrentUser: vi.fn(),
}));

vi.mock("./auth-gateway", () => ({ login, logout, fetchCurrentUser }));

const user: AuthUser = {
  id: "018f2c9e-1d3a-7b21-9c44-2f1a6b5d0e77",
  email: "manager@example.com",
  status: "ACTIVE",
};

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

describe("useCurrentUser", () => {
  it("exposes the account returned by the gateway", async () => {
    fetchCurrentUser.mockResolvedValue(user);
    const client = makeClient();

    const { result } = renderHook(() => useCurrentUser(), {
      wrapper: wrapper(client),
    });

    await waitFor(() => expect(result.current.data).toEqual(user));
  });
});

describe("useLoginMutation", () => {
  it("seeds the session cache from a successful result", async () => {
    login.mockResolvedValue({ outcome: { status: "success" }, user });
    const client = makeClient();

    const { result } = renderHook(() => useLoginMutation(), {
      wrapper: wrapper(client),
    });

    await result.current.mutateAsync({ email: user.email, password: "pw" });

    expect(client.getQueryData(authKeys.currentUser)).toEqual(user);
  });

  it("leaves the cache untouched when sign-in is rejected", async () => {
    login.mockResolvedValue({
      outcome: { status: "invalid_credentials" },
      user: null,
    });
    const client = makeClient();

    const { result } = renderHook(() => useLoginMutation(), {
      wrapper: wrapper(client),
    });

    await result.current.mutateAsync({ email: user.email, password: "pw" });

    expect(client.getQueryData(authKeys.currentUser)).toBeUndefined();
  });
});

describe("useLogoutMutation", () => {
  it("clears the session cache once the request settles", async () => {
    logout.mockResolvedValue(undefined);
    const client = makeClient();
    client.setQueryData(authKeys.currentUser, user);

    const { result } = renderHook(() => useLogoutMutation(), {
      wrapper: wrapper(client),
    });

    await result.current.mutateAsync();

    expect(client.getQueryData(authKeys.currentUser)).toBeNull();
  });
});

describe("permission cache isolation", () => {
  it("does not let a late permission response restore grants after logout", async () => {
    logout.mockResolvedValue(undefined);
    const client = makeClient();
    let resolveAccess!: (value: unknown) => void;
    const request = client
      .fetchQuery({
        queryKey: ["auth", "access"],
        queryFn: () =>
          new Promise((resolve) => {
            resolveAccess = resolve;
          }),
      })
      .catch(() => undefined);
    const { result } = renderHook(() => useLogoutMutation(), {
      wrapper: wrapper(client),
    });
    await result.current.mutateAsync();
    resolveAccess({
      userId: "old-account",
      grants: [{ permissionKey: "role.read", scope: "ORGANIZATION" }],
    });
    await request;
    expect(client.getQueryData(["auth", "access"])).toBeNull();
  });
});
