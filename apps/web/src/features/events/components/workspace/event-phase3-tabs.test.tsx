import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { listEventMeetings } from "@/features/meetings/api/meetings-gateway";
import { listTasks } from "@/features/tasks/api/tasks-gateway";

import { listEventMilestones } from "../../api/events-gateway";

import { EventCalendarTab } from "./event-calendar-tab";
import { EventMeetingsTab } from "./event-meetings-tab";
import { EventTasksTab } from "./event-tasks-tab";

const workspace = vi.hoisted(() => ({ value: null as unknown }));

vi.mock("./event-workspace-shell", () => ({
  useEventWorkspace: () => workspace.value,
}));

vi.mock("@/features/meetings/api/meetings-gateway", () => ({
  listEventMeetings: vi.fn(),
}));

vi.mock("@/features/tasks/api/tasks-gateway", () => ({
  listTasks: vi.fn(),
}));

vi.mock("../../api/events-gateway", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../api/events-gateway")>()),
  listEventMilestones: vi.fn(),
}));

const EVENT_ID = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";

function setWorkspace() {
  workspace.value = {
    event: { id: EVENT_ID, name: "Launch night", workspaceId: WORKSPACE_ID },
    access: { userId: "me", grants: [] },
    abilities: {},
  };
}

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

describe("event workspace Phase 3 tabs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setWorkspace();
  });

  it("Tasks lists the event's linked tasks and an empty state", async () => {
    vi.mocked(listTasks).mockResolvedValue({
      items: [
        {
          id: "t1",
          title: "Book lighting",
          status: "IN_PROGRESS",
          priority: "HIGH",
          dueAt: "2026-11-09T12:00:00.000Z",
        },
      ],
      total: 1,
      page: 1,
      pageSize: 50,
    } as never);

    renderWithClient(<EventTasksTab />);

    expect(await screen.findByText("Book lighting")).toBeInTheDocument();
    expect(listTasks).toHaveBeenCalledWith(
      expect.objectContaining({ relatedEventId: EVENT_ID }),
      expect.anything(),
    );
  });

  it("Tasks shows an empty state when nothing is linked", async () => {
    vi.mocked(listTasks).mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 50,
    } as never);

    renderWithClient(<EventTasksTab />);

    expect(await screen.findByText("No tasks linked yet")).toBeInTheDocument();
  });

  it("Meetings lists the meetings for the event's workspace", async () => {
    vi.mocked(listEventMeetings).mockResolvedValue([
      {
        id: "m1",
        title: "Kickoff",
        startAt: "2026-11-10T09:00:00.000Z",
        status: "SCHEDULED",
      },
    ] as never);

    renderWithClient(<EventMeetingsTab />);

    expect(await screen.findByText("Kickoff")).toBeInTheDocument();
    expect(listEventMeetings).toHaveBeenCalledWith(
      WORKSPACE_ID,
      expect.anything(),
    );
  });

  it("Calendar merges milestones, meetings and task due dates in order", async () => {
    vi.mocked(listEventMilestones).mockResolvedValue([
      { id: "ms1", name: "Venue confirmed", dueDate: "2026-11-10" },
    ] as never);
    vi.mocked(listEventMeetings).mockResolvedValue([
      { id: "mt1", title: "Kickoff", startAt: "2026-11-10T09:00:00.000Z" },
    ] as never);
    vi.mocked(listTasks).mockResolvedValue({
      items: [
        { id: "t1", title: "Book lighting", dueAt: "2026-11-09T12:00:00.000Z" },
      ],
      total: 1,
      page: 1,
      pageSize: 100,
    } as never);

    renderWithClient(<EventCalendarTab />);

    const items = await screen.findAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringContaining("Book lighting"),
      expect.stringContaining("Venue confirmed"),
      expect.stringContaining("Kickoff"),
    ]);
  });
});
