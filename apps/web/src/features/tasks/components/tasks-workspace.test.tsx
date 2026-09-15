import { type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { TASK_WORKSPACE_FIXTURE } from "../lib/task-fixtures";
import { TaskWorkspace } from "./tasks-workspace";

function renderWorkspace(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{node}</QueryClientProvider>,
  );
}

describe("TaskWorkspace", () => {
  it("switches between the accessible list, board, and calendar projections", async () => {
    const user = userEvent.setup();
    renderWorkspace(<TaskWorkspace data={TASK_WORKSPACE_FIXTURE} />);

    expect(screen.getByRole("table")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Board" }));
    expect(screen.getByRole("region", { name: "To do tasks" })).toBeVisible();
    expect(
      screen.getByRole("region", { name: "Under review tasks" }),
    ).toBeVisible();
    expect(
      screen.getByRole("region", { name: "Blocked tasks" }),
    ).toHaveTextContent("Receive catering confirmation");

    await user.click(screen.getByRole("button", { name: "Calendar" }));
    expect(screen.getByRole("region", { name: "Task calendar" })).toBeVisible();
    expect(screen.getByText("Confirm venue accessibility plan")).toBeVisible();
  });

  it("filters tasks and gives a clear empty-state recovery message", async () => {
    const user = userEvent.setup();
    renderWorkspace(<TaskWorkspace data={TASK_WORKSPACE_FIXTURE} />);

    await user.type(screen.getByLabelText("Search tasks"), "not-a-task");

    expect(screen.getByText("No tasks match these filters")).toBeVisible();
    expect(
      screen.getByText("Clear a filter or adjust your search to see tasks."),
    ).toBeVisible();
  });

  it("opens task detail with collaborators, attachments, comments, and activity", async () => {
    const user = userEvent.setup();
    renderWorkspace(<TaskWorkspace data={TASK_WORKSPACE_FIXTURE} />);

    await user.click(
      screen.getAllByRole("button", {
        name: "Confirm venue accessibility plan",
      })[0]!,
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeVisible();
    expect(screen.getByRole("heading", { name: "Assignees" })).toBeVisible();
    expect(
      screen.getByRole("list", { name: "Task assignees" }),
    ).toHaveTextContent("Maya Chen");
    expect(dialog).toHaveTextContent("accessible-route-map.pdf");
    expect(
      screen.getByText("The venue has sent the revised accessible-route map."),
    ).toBeVisible();
    expect(dialog).toHaveTextContent("No review has been recorded.");
  });

  it("shows an actionable recoverable loading error", async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    renderWorkspace(
      <TaskWorkspace
        data={TASK_WORKSPACE_FIXTURE}
        error="The task service did not respond."
        onRetry={retry}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Tasks could not be loaded",
    );
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("uses mobile-first and larger-screen layout classes for the primary views", () => {
    const { container } = renderWorkspace(
      <TaskWorkspace data={TASK_WORKSPACE_FIXTURE} />,
    );
    expect(
      container.querySelector("table")?.parentElement?.className,
    ).toContain("sm:block");
    expect(container.querySelector("section")?.className).toContain(
      "space-y-5",
    );
    expect(screen.getByRole("list", { name: "Task list" })).toBeVisible();
  });

  it("uses ordinary keyboard-operable view buttons instead of incomplete tab semantics", async () => {
    const user = userEvent.setup();
    renderWorkspace(<TaskWorkspace data={TASK_WORKSPACE_FIXTURE} />);

    const board = screen.getByRole("button", { name: "Board" });
    board.focus();
    await user.keyboard("{Enter}");

    expect(board).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("region", { name: "To do tasks" })).toBeVisible();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  });
});
