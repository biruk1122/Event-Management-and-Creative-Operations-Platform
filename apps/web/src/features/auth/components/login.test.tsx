import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LoginResult } from "../api/auth-gateway";
import { Login } from "./login";

const { replace, refresh, mutateAsync } = vi.hoisted(() => ({
  replace: vi.fn(),
  refresh: vi.fn(),
  mutateAsync: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh }),
}));

vi.mock("../api/auth-queries", () => ({
  useLoginMutation: () => ({ mutateAsync }),
}));

async function fillAndSubmit() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Email"), "manager@example.com");
  await user.type(screen.getByLabelText("Password"), "correct horse");
  await user.click(screen.getByRole("button", { name: "Sign in" }));
}

const resolve = (result: LoginResult) => mutateAsync.mockResolvedValue(result);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Login", () => {
  it("redirects to the validated destination on success", async () => {
    resolve({ outcome: { status: "success" }, user: null });
    render(<Login redirectTo="/events/42" />);

    await fillAndSubmit();

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/events/42"));
    expect(refresh).toHaveBeenCalled();
  });

  it("redirects home when there is no next target", async () => {
    resolve({ outcome: { status: "success" }, user: null });
    render(<Login />);

    await fillAndSubmit();

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  });

  it("shows the error and stays on the page when sign-in is rejected", async () => {
    resolve({ outcome: { status: "invalid_credentials" }, user: null });
    render(<Login />);

    await fillAndSubmit();

    expect(
      await screen.findByText("Your email or password is incorrect"),
    ).toBeVisible();
    expect(replace).not.toHaveBeenCalled();
  });
});
