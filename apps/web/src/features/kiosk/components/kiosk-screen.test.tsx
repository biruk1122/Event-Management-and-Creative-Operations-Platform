import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { KioskScreen } from "./kiosk-screen";
import * as gateway from "../api/kiosk-gateway";
import { storeKioskCredentials } from "../api/kiosk-client";

vi.mock("@/env/client", () => ({
  clientEnvironment: {
    NEXT_PUBLIC_API_URL: "https://api.test.invalid",
    NEXT_PUBLIC_WS_URL: "wss://ws.test.invalid",
  },
}));
vi.mock("../api/kiosk-gateway");

const EMPLOYEE = { id: "employee-1", name: "Ada Employee" };

function activate() {
  storeKioskCredentials({ kioskId: "kiosk-1", token: "token-1", kioskName: "Front Desk" });
}

describe("KioskScreen", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
    vi.mocked(gateway.checkActivation).mockResolvedValue({ status: "valid" });
    vi.mocked(gateway.searchEmployees).mockResolvedValue([EMPLOYEE]);
  });

  it("shows the activation screen when no device credentials are stored", async () => {
    render(<KioskScreen />);
    expect(
      await screen.findByRole("heading", { name: "Activate this kiosk" }),
    ).toBeInTheDocument();
    expect(gateway.checkActivation).not.toHaveBeenCalled();
  });

  it("activates, stores credentials, and reaches employee selection", async () => {
    vi.mocked(gateway.checkActivation).mockResolvedValue({ status: "invalid" });
    const user = userEvent.setup();
    render(<KioskScreen />);
    await screen.findByRole("heading", { name: "Activate this kiosk" });

    await user.type(screen.getByLabelText("Device name"), "Front Desk");
    await user.type(screen.getByLabelText("Kiosk ID"), "kiosk-1");
    await user.type(screen.getByLabelText("Bearer token"), "token-1");

    vi.mocked(gateway.checkActivation).mockResolvedValue({ status: "valid" });
    await user.click(screen.getByRole("button", { name: "Activate" }));

    expect(
      await screen.findByRole("heading", { name: "Find your name" }),
    ).toBeInTheDocument();
    expect(window.localStorage.getItem("lela:kiosk:credentials")).toContain("kiosk-1");
  });

  it("goes straight to employee selection when stored credentials are still valid", async () => {
    activate();
    render(<KioskScreen />);
    expect(
      await screen.findByRole("heading", { name: "Find your name" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Ada Employee")).toBeInTheDocument();
  });

  it("clears stored credentials and returns to activation when the device is no longer recognized", async () => {
    activate();
    vi.mocked(gateway.checkActivation).mockResolvedValue({ status: "invalid" });
    render(<KioskScreen />);
    expect(
      await screen.findByRole("heading", { name: "Activate this kiosk" }),
    ).toBeInTheDocument();
    expect(window.localStorage.getItem("lela:kiosk:credentials")).toBeNull();
  });

  it("completes the full verify-then-check-in flow and resets after showing the result", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    activate();
    vi.mocked(gateway.verifyEmployee).mockResolvedValue({
      status: "success",
      result: {
        sessionToken: "session-token",
        employeeName: "Ada Employee",
        hasOpenSession: false,
        expiresAt: new Date().toISOString(),
      },
    });
    vi.mocked(gateway.punch).mockResolvedValue({
      status: "success",
      result: { punchType: "CHECK_IN", recordedAt: new Date().toISOString(), message: "Checked in successfully." },
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<KioskScreen />);
    await screen.findByText("Ada Employee");
    await user.click(screen.getByRole("button", { name: "Ada Employee" }));

    await screen.findByRole("heading", { name: "Ada Employee" });
    await user.type(screen.getByLabelText("Password"), "correct-password");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("button", { name: "Check in" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Check in" }));

    expect(await screen.findByText("Checked in successfully.")).toBeInTheDocument();
    expect(gateway.punch).toHaveBeenCalledWith(
      "session-token",
      "CHECK_IN",
      expect.any(String),
    );

    vi.advanceTimersByTime(4100);
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Find your name" })).toBeInTheDocument(),
    );
    vi.useRealTimers();
  });

  it("shows an inline error for a wrong password without leaving the password screen", async () => {
    activate();
    vi.mocked(gateway.verifyEmployee).mockResolvedValue({ status: "invalid_credentials" });
    const user = userEvent.setup();
    render(<KioskScreen />);
    await screen.findByText("Ada Employee");
    await user.click(screen.getByRole("button", { name: "Ada Employee" }));
    await user.type(await screen.findByLabelText("Password"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(
      await screen.findByText("That password does not match this account."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toHaveValue("");
  });
});
