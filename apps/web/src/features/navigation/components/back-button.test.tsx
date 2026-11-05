import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NAVIGATION_TRAIL_KEY } from "../lib/navigation-trail";
import { BackButton } from "./back-button";

const { back, push } = vi.hoisted(() => ({ back: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ back, push, replace: vi.fn() }),
}));

beforeEach(() => {
  back.mockReset();
  push.mockReset();
  window.sessionStorage.clear();
});

afterEach(() => {
  window.sessionStorage.clear();
});

describe("BackButton", () => {
  it("returns to the previous in-app page when the tab has one", async () => {
    window.sessionStorage.setItem(
      NAVIGATION_TRAIL_KEY,
      JSON.stringify(["/tasks?q=budget", "/tasks/t1"]),
    );
    render(<BackButton fallbackHref="/tasks" />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Back" }));
    expect(back).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
  });

  it("goes to the parent listing for a direct visit, so it never leaves the app", async () => {
    window.sessionStorage.setItem(
      NAVIGATION_TRAIL_KEY,
      JSON.stringify(["/tasks/t1"]),
    );
    render(<BackButton fallbackHref="/tasks" />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Back" }));
    expect(push).toHaveBeenCalledWith("/tasks");
    expect(back).not.toHaveBeenCalled();
  });
});
