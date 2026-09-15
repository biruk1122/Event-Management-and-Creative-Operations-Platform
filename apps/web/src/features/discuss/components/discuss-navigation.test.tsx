import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CurrentAccess } from "@/features/auth/api/access-queries";
import { DiscussNavigation } from "./discuss-navigation";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api/browser", () => ({ browserApi: { GET: get } }));

let access: CurrentAccess | null;
let status = 200;

beforeEach(() => {
  access = {
    userId: "a1",
    grants: [{ permissionKey: "conversation.read", scope: "SELF" }],
  };
  status = 200;
  get.mockImplementation(async () => ({ data: access, response: { status } }));
});

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <DiscussNavigation />
    </QueryClientProvider>,
  );
}

describe("DiscussNavigation", () => {
  it("links to both direct messages and channels for a baseline caller", async () => {
    setup();
    expect(
      await screen.findByRole("link", { name: "Direct messages" }),
    ).toHaveAttribute("href", "/discuss/dm");
    expect(screen.getByRole("link", { name: "Channels" })).toHaveAttribute(
      "href",
      "/discuss/channels",
    );
  });

  it("links when only the channel.participate grant is held", async () => {
    access = {
      userId: "a1",
      grants: [{ permissionKey: "channel.participate", scope: "SELF" }],
    };
    setup();
    expect(
      await screen.findByRole("link", { name: "Direct messages" }),
    ).toBeInTheDocument();
  });

  it("renders nothing without either grant", async () => {
    access = { userId: "a1", grants: [] };
    setup();
    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(
      screen.queryByRole("link", { name: "Direct messages" }),
    ).not.toBeInTheDocument();
  });

  it("renders nothing when there is no active session", async () => {
    access = null;
    status = 401;
    setup();
    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(
      screen.queryByRole("link", { name: "Direct messages" }),
    ).not.toBeInTheDocument();
  });
});
