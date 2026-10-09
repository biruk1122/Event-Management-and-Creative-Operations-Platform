import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LoginResult } from "../api/auth-gateway";
import { Login } from "./login";

const { replace, refresh, mutateAsync, destination } = vi.hoisted(() => ({
  replace: vi.fn(),
  refresh: vi.fn(),
  mutateAsync: vi.fn(),
  destination: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh }),
}));

vi.mock("../api/auth-queries", () => ({
  useLoginMutation: () => ({ mutateAsync }),
}));
vi.mock("../api/login-destination", () => ({ loginDestination: destination }));

async function fillAndSubmit() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Email"), "manager@example.com");
  await user.type(screen.getByLabelText("Password"), "correct horse");
  await user.click(screen.getByRole("button", { name: "Sign in" }));
}

const resolve = (result: LoginResult) => mutateAsync.mockResolvedValue(result);

beforeEach(() => {
  vi.clearAllMocks();
  destination.mockResolvedValue("/dashboard");
});

describe("Login", () => {
  it("redirects to the validated destination on success", async () => {
    resolve({ outcome: { status: "success" }, user: null });
    destination.mockResolvedValue("/calendar?view=week");
    render(<Login redirectTo="/calendar?view=week" />);

    await fillAndSubmit();

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/calendar?view=week"),
    );
    expect(destination).toHaveBeenCalledWith("/calendar?view=week");
    expect(refresh).toHaveBeenCalled();
  });

  it("redirects to dashboard when there is no next target", async () => {
    resolve({ outcome: { status: "success" }, user: null });
    render(<Login />);

    await fillAndSubmit();

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/dashboard"));
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
