import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EventsRequestError, listEventTalents } from "../../api/events-gateway";

import { EventTalentsTab } from "./event-talents-tab";

const workspace = vi.hoisted(() => ({
  value: null as unknown,
}));

vi.mock("./event-workspace-shell", () => ({
  useEventWorkspace: () => workspace.value,
}));

vi.mock("../../api/events-gateway", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../api/events-gateway")>();
  return { ...actual, listEventTalents: vi.fn() };
});

const EVENT_ID = "11111111-1111-4111-8111-111111111111";

function row(overrides: Record<string, unknown> = {}) {
  return {
    kind: "EVENT",
    id: "a1",
    workId: EVENT_ID,
    workName: "Launch night",
    departmentId: null,
    role: "Headliner",
    status: "ASSIGNED",
    phase: "UPCOMING",
    notes: null,
    startAt: null,
    endAt: null,
    assignedAt: "2026-11-01T10:00:00.000Z",
    completedAt: null,
    cancelledAt: null,
    cancelReason: null,
    assignedBy: null,
    cancelledBy: null,
    talent: {
      id: "t1",
      fullName: "Ada Artist",
      type: "ARTIST",
      availability: "AVAILABLE",
    },
    ...overrides,
  };
}

function setWorkspace(grants: { permissionKey: string; scope: string }[]) {
  workspace.value = {
    event: { id: EVENT_ID, name: "Launch night" },
    access: { userId: "me", grants },
    abilities: {},
  };
}

function renderTab() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <EventTalentsTab />
    </QueryClientProvider>,
  );
}

describe("EventTalentsTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists the event's talent with role and status, and no contact details", async () => {
    setWorkspace([{ permissionKey: "talent.assign", scope: "ORGANIZATION" }]);
    vi.mocked(listEventTalents).mockResolvedValue([row()] as never);

    renderTab();

    expect(await screen.findByText("Ada Artist")).toBeInTheDocument();
    expect(screen.getByText(/Headliner/)).toBeInTheDocument();
    expect(screen.getByText("Assigned")).toBeInTheDocument();
    expect(screen.queryByText(/@/)).toBeNull();
    expect(screen.queryByText(/phone/i)).toBeNull();
  });

  it("offers assign, edit and close actions to callers with talent.assign", async () => {
    setWorkspace([{ permissionKey: "talent.assign", scope: "ORGANIZATION" }]);
    vi.mocked(listEventTalents).mockResolvedValue([row()] as never);

    renderTab();

    expect(
      await screen.findByRole("button", { name: /assign talent/i }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: /edit ada artist/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /cancel assignment/i }),
    ).toBeInTheDocument();
  });

  it("hides assign and row actions without talent.assign", async () => {
    setWorkspace([]);
    vi.mocked(listEventTalents).mockResolvedValue([row()] as never);

    renderTab();

    await screen.findByText("Ada Artist");
    expect(screen.queryByRole("button", { name: /assign talent/i })).toBeNull();
    expect(
      screen.queryByRole("button", { name: /cancel assignment/i }),
    ).toBeNull();
  });

  it("explains when talent is not available for the caller's access", async () => {
    setWorkspace([]);
    vi.mocked(listEventTalents).mockRejectedValue(new EventsRequestError(403));

    renderTab();

    expect(
      await screen.findByText(
        "Talent assignments are not available for your access.",
      ),
    ).toBeInTheDocument();
  });
});
