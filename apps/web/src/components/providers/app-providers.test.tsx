import { act, render } from "@testing-library/react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { publishSessionEvent } from "@/lib/api/session-events";
import { AppProviders } from "./app-providers";

vi.mock("@/lib/api/browser", () => ({
  browserSession: { start: () => () => {} },
}));
const user = {
  id: "actor",
  email: "actor@example.test",
  status: "ACTIVE" as const,
};

describe("session cache coordination", () => {
  it("retains protected data on renewal and clears it on logout or account switching", () => {
    let client!: QueryClient;
    function Observer() {
      client = useQueryClient();
      return null;
    }
    render(
      <AppProviders>
        <Observer />
      </AppProviders>,
    );
    client.setQueryData(["dashboards", "actor"], { count: 17 });
    client.setQueryData(["auth", "access"], { userId: "actor" });
    act(() => publishSessionEvent({ type: "renewed", user }));
    expect(client.getQueryData(["dashboards", "actor"])).toEqual({ count: 17 });
    expect(client.getQueryData(["auth", "access"])).toEqual({
      userId: "actor",
    });
    act(() => publishSessionEvent({ type: "ended" }));
    expect(client.getQueryData(["dashboards", "actor"])).toBeUndefined();
    expect(client.getQueryData(["auth", "access"])).toBeNull();
    expect(client.getQueryData(["auth", "current-user"])).toBeNull();
    client.setQueryData(["reports", "actor"], { private: true });
    act(() =>
      publishSessionEvent({ type: "changed", user: { ...user, id: "other" } }),
    );
    expect(client.getQueryData(["reports", "actor"])).toBeUndefined();
    expect(client.getQueryData(["auth", "current-user"])).toMatchObject({
      id: "other",
    });
  });
});
