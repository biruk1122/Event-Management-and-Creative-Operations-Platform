import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  accessKey,
  type CurrentAccess,
} from "@/features/auth/api/access-queries";
import { TeamsScreen } from "./teams-screen";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api/browser", () => ({ browserApi: { GET: get } }));

const fullAccess: CurrentAccess = {
  userId: "account-1",
  grants: [{ permissionKey: "team.read", scope: "ORGANIZATION" }],
};

let currentAccess: CurrentAccess | null;

beforeEach(() => {
  currentAccess = fullAccess;
  get.mockImplementation(async (path: string) => {
    if (path === "/api/v1/auth/me/permissions") {
      return {
        data: currentAccess,
        response: { status: currentAccess ? 200 : 401 },
      };
    }
    if (path === "/api/v1/teams") {
      return {
        data: { items: [], page: 1, pageSize: 10, total: 0 },
        response: { ok: true, status: 200 },
      };
    }
    return {
      data: { items: [], page: 1, pageSize: 100, total: 0 },
      response: { ok: true, status: 200 },
    };
  });
});

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <TeamsScreen />
    </QueryClientProvider>,
  );
  return client;
}

describe("TeamsScreen access boundary", () => {
  it("renders the manager once team.read is confirmed", async () => {
    setup();
    expect(await screen.findByText("No teams yet")).toBeVisible();
  });

  it("admits a department-scoped reader", async () => {
    currentAccess = {
      userId: "account-1",
      grants: [{ permissionKey: "team.read", scope: "DEPARTMENT" }],
    };
    setup();
    expect(await screen.findByText("No teams yet")).toBeVisible();
  });

  it("shows a denied message when the grant is absent", async () => {
    currentAccess = { userId: "account-1", grants: [] };
    setup();
    expect(
      await screen.findByText("You do not have access to this area."),
    ).toBeVisible();
  });

  it("drops to the session-expired state and clears team cache", async () => {
    const client = setup();
    await screen.findByText("No teams yet");

    currentAccess = null;
    await act(async () => {
      await client.invalidateQueries({ queryKey: accessKey });
    });

    expect(
      await screen.findByText(
        "Your session expired. Your unsaved input is kept in this tab.",
      ),
    ).toBeVisible();
    expect(
      client.getQueryCache().findAll({ queryKey: ["teams"] }),
    ).toHaveLength(0);
  });

  it("recovers to the manager after signing back in", async () => {
    const client = setup();
    await screen.findByText("No teams yet");
    currentAccess = null;
    await act(async () => {
      await client.invalidateQueries({ queryKey: accessKey });
    });
    await screen.findByText(
      "Your session expired. Your unsaved input is kept in this tab.",
    );

    currentAccess = fullAccess;
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "I have signed in" }));
    expect(await screen.findByText("No teams yet")).toBeVisible();
  });
});
