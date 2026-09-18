import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CurrentAccess } from "@/features/auth/api/access-queries";

import { MeetingsManager } from "./meetings-manager";

const { get, put } = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock("@/lib/api/browser", () => ({ browserApi: { GET: get, PUT: put } }));
vi.mock("@/lib/api/csrf", () => ({ readCsrfToken: () => "csrf-token" }));
vi.mock("@/env/client", () => ({
  clientEnvironment: {
    NEXT_PUBLIC_WS_URL: "http://localhost:4000",
    NEXT_PUBLIC_API_URL: "http://localhost:4000/api/v1",
  },
}));

const access: CurrentAccess = {
  userId: "user-1",
  grants: [
    { permissionKey: "meeting.read", scope: "SELF" },
    { permissionKey: "meeting.respond", scope: "SELF" },
  ],
};

const meeting = {
  id: "meeting-1",
  workspaceId: null,
  title: "Venue review",
  description: "Review the final venue plan.",
  type: "HYBRID" as const,
  status: "SCHEDULED" as const,
  organizer: {
    id: "organizer-1",
    email: "organizer@example.com",
    firstName: "Aster",
    lastName: "Bekele",
  },
  startAt: "2026-10-10T09:00:00.000Z",
  endAt: "2026-10-10T10:00:00.000Z",
  location: "Studio A",
  onlineLink: "https://meet.example.com/venue-review",
  reminderAt: null,
  participants: [
    {
      id: "user-1",
      email: "user@example.com",
      firstName: "Biruk",
      lastName: null,
      response: "PENDING" as const,
      respondedAt: null,
      invitedAt: "2026-10-01T09:00:00.000Z",
    },
  ],
  createdAt: "2026-10-01T09:00:00.000Z",
  updatedAt: "2026-10-01T09:00:00.000Z",
};

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MeetingsManager access={access} connect={() => () => undefined} />
    </QueryClientProvider>,
  );
}

describe("MeetingsManager", () => {
  beforeEach(() => {
    get.mockResolvedValue({
      data: { items: [meeting], page: 1, pageSize: 25, total: 1 },
      response: { status: 200 },
    });
    put.mockResolvedValue({
      data: {
        meetingId: meeting.id,
        response: "ACCEPTED",
        respondedAt: "2026-10-02T09:00:00.000Z",
      },
      response: { status: 200 },
    });
  });

  it("drives meeting details and a durable invitation response from the REST API", async () => {
    const user = userEvent.setup();
    setup();
    expect(
      await screen.findByRole("heading", { name: "Venue review" }),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(put).toHaveBeenCalled());
    expect(put).toHaveBeenCalledWith(
      "/api/v1/meetings/{id}/response",
      expect.objectContaining({
        params: { path: { id: "meeting-1" } },
        body: { response: "ACCEPTED" },
        headers: { "x-csrf-token": "csrf-token" },
      }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "marked accepted",
    );
  });

  it("preserves the response controls after a recoverable API failure", async () => {
    const user = userEvent.setup();
    put.mockResolvedValueOnce({ data: undefined, response: { status: 409 } });
    setup();
    await screen.findByRole("heading", { name: "Venue review" });
    await user.click(screen.getByRole("button", { name: "Decline" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "already been answered",
    );
    expect(screen.getByRole("button", { name: "Accept" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Decline" })).toBeEnabled();
  });

  it("loads the next page of meetings on demand, past the first page", async () => {
    const user = userEvent.setup();
    const older = { ...meeting, id: "meeting-2", title: "Sponsor check-in" };
    get
      .mockResolvedValueOnce({
        data: { items: [meeting], page: 1, pageSize: 25, total: 26 },
        response: { status: 200 },
      })
      .mockResolvedValueOnce({
        data: { items: [older], page: 2, pageSize: 25, total: 26 },
        response: { status: 200 },
      });
    setup();

    await screen.findByRole("heading", { name: "Venue review" });
    expect(screen.queryByText("Sponsor check-in")).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Load more meetings" }),
    );

    expect(await screen.findByText("Sponsor check-in")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Load more meetings" }),
    ).not.toBeInTheDocument();
    expect(get).toHaveBeenCalledWith(
      "/api/v1/meetings",
      expect.objectContaining({
        params: { query: { page: 2, pageSize: 25 } },
      }),
    );
  });
});
