import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  accessKey,
  type CurrentAccess,
} from "@/features/auth/api/access-queries";
import { DiscussScreen } from "./discuss-screen";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api/browser", () => ({ browserApi: { GET: get } }));

const fullAccess: CurrentAccess = {
  userId: "account-1",
  grants: [{ permissionKey: "conversation.read", scope: "SELF" }],
};

let currentAccess: CurrentAccess | null;

beforeEach(() => {
  currentAccess = fullAccess;
  get.mockImplementation(async () => ({
    data: currentAccess,
    response: { status: currentAccess ? 200 : 401 },
  }));
});

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <DiscussScreen kind="dm" initialConversationId={null} />
    </QueryClientProvider>,
  );
  return client;
}

describe("DiscussScreen access boundary", () => {
  it("renders the manager once conversation.read is confirmed", async () => {
    setup();
    expect(
      await screen.findByRole("button", { name: "New conversation" }),
    ).toBeVisible();
  });

  it("shows a denied message when the grant is absent", async () => {
    currentAccess = { userId: "account-1", grants: [] };
    setup();
    expect(
      await screen.findByText("You do not have access to this area."),
    ).toBeVisible();
  });

  it("drops to the session-expired state and clears the Discuss cache", async () => {
    const client = setup();
    await screen.findByRole("button", { name: "New conversation" });

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
      client.getQueryCache().findAll({ queryKey: ["discuss", "dm"] }),
    ).toHaveLength(0);
  });

  it("recovers to the manager after signing back in", async () => {
    const client = setup();
    await screen.findByRole("button", { name: "New conversation" });
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
    expect(
      await screen.findByRole("button", { name: "New conversation" }),
    ).toBeVisible();
  });
});
