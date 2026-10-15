import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Meeting } from "../api/meetings-gateway";
import { GoogleMeetControls } from "./google-meet-controls";

const gateway = vi.hoisted(() => ({
  meetStatus: vi.fn(),
  authorizeGoogle: vi.fn(),
  syncGoogle: vi.fn(),
  cleanupGoogle: vi.fn(),
  disconnectGoogle: vi.fn(),
  saveManualMeetingLink: vi.fn(),
}));
vi.mock("../api/google-meet-gateway", () => gateway);
const meeting: Meeting = {
  id: "meeting-1",
  title: "Private meeting",
  description: null,
  workspaceId: null,
  type: "ONLINE",
  status: "SCHEDULED",
  organizer: {
    id: "owner",
    email: "owner@test.local",
    firstName: null,
    lastName: null,
  },
  startAt: "2030-01-01T12:00:00Z",
  endAt: "2030-01-01T13:00:00Z",
  location: null,
  onlineLink: "https://video.example.test/manual",
  reminderAt: null,
  agenda: null,
  minutes: null,
  participants: [],
  createdAt: "2030-01-01T10:00:00Z",
  updatedAt: "2030-01-01T10:00:00Z",
};
function setup() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
          },
        })
      }
    >
      <GoogleMeetControls meeting={meeting} userId="owner" />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  gateway.meetStatus.mockResolvedValue({
    enabled: true,
    connection: "CONNECTED",
    exportState: "READY",
    failure: null,
  });
});
describe("optional Google meeting controls", () => {
  it("keeps manual link editing available while automation is disabled", async () => {
    gateway.meetStatus.mockResolvedValue({
      enabled: false,
      connection: "DISCONNECTED",
      exportState: "NONE",
      failure: null,
    });
    gateway.saveManualMeetingLink.mockResolvedValue(meeting);
    const user = userEvent.setup();
    setup();
    expect(await screen.findByText(/Automatic links are off/)).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /Connect Google Calendar/ }),
    ).not.toBeInTheDocument();
    const input = screen.getByLabelText("Manual online meeting link");
    await user.clear(input);
    await user.type(input, "https://video.example.test/new");
    await user.click(screen.getByRole("button", { name: "Save manual link" }));
    await waitFor(() =>
      expect(gateway.saveManualMeetingLink).toHaveBeenCalledWith(
        meeting.id,
        "https://video.example.test/new",
      ),
    );
  });
  it("requires explicit consent and explains offline scope and minimal export", async () => {
    gateway.meetStatus.mockResolvedValue({
      enabled: true,
      connection: "DISCONNECTED",
      exportState: "NONE",
      failure: null,
    });
    const user = userEvent.setup();
    setup();
    const connect = await screen.findByRole("button", {
      name: "Connect Google Calendar",
    });
    expect(connect).toBeDisabled();
    expect(
      screen.getByText(/offline access to events on calendars you own/),
    ).toBeVisible();
    await user.click(screen.getByRole("checkbox"));
    expect(connect).toBeEnabled();
  });
  it("preserves the manual input when generation fails and offers safe retry", async () => {
    gateway.syncGoogle.mockRejectedValue(
      new Error("Google unavailable; use a manual link."),
    );
    const user = userEvent.setup();
    setup();
    await user.click(
      await screen.findByRole("button", { name: "Generate / sync Meet link" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Google unavailable",
    );
    expect(screen.getByLabelText("Manual online meeting link")).toHaveValue(
      meeting.onlineLink,
    );
    expect(
      screen.getByRole("button", { name: "Save manual link" }),
    ).toBeEnabled();
  });
  it("reports uncertain remote revocation rather than claiming a room was revoked", async () => {
    gateway.disconnectGoogle.mockResolvedValue({ remoteRevoked: false });
    const user = userEvent.setup();
    setup();
    await user.click(
      await screen.findByRole("button", { name: "Disconnect Google" }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Local credentials erased. Google revocation could not be confirmed",
    );
  });
  it("does not show another user's cached connection", async () => {
    gateway.meetStatus.mockRejectedValue(
      new Error(
        "Only the authorized meeting organizer can manage this connection.",
      ),
    );
    setup();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Only the authorized meeting organizer",
    );
    expect(
      screen.queryByRole("button", { name: "Generate / sync Meet link" }),
    ).not.toBeInTheDocument();
  });
});
