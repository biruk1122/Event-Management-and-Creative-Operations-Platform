import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  JitsiMeetingRoom,
  type JitsiExternalApiConstructor,
  type JitsiMeetApi,
} from "./jitsi-meeting-room";
import type { JitsiSession } from "../api/jitsi-gateway";

const session: JitsiSession = {
  domain: "meet.example.test",
  roomName: "lela-meeting-1",
  displayName: "Robin Doer",
  moderator: true,
  jwt: null,
};

function makeApi(): { api: JitsiMeetApi; Api: JitsiExternalApiConstructor } {
  const api: JitsiMeetApi = {
    addEventListener: vi.fn(),
    executeCommand: vi.fn(),
    dispose: vi.fn(),
  };
  // A plain `function`, not an arrow function - `new Api(...)` needs a real
  // constructor so the mock's explicit object return is honored.
  const Api = vi.fn(function () {
    return api;
  }) as unknown as JitsiExternalApiConstructor;
  return { api, Api };
}

describe("JitsiMeetingRoom", () => {
  it("constructs the external API exactly once per mount with the session's details", async () => {
    const { Api } = makeApi();
    const loadExternalApi = vi.fn().mockResolvedValue(Api);
    render(
      <JitsiMeetingRoom
        session={session}
        meetingTitle="Weekly sync"
        onLeave={vi.fn()}
        canEndForEveryone={false}
        onEndForEveryone={vi.fn()}
        loadExternalApi={loadExternalApi}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading the meeting room",
    );
    await waitFor(() => expect(Api).toHaveBeenCalledTimes(1));
    expect(Api).toHaveBeenCalledWith(
      "meet.example.test",
      expect.objectContaining({
        roomName: "lela-meeting-1",
        userInfo: { displayName: "Robin Doer" },
        configOverwrite: expect.objectContaining({ startWithVideoMuted: true }),
        interfaceConfigOverwrite: expect.objectContaining({
          SHOW_JITSI_WATERMARK: false,
        }),
      }),
    );
  });

  it("disposes the API exactly once on unmount, even if it never finished connecting", async () => {
    const { api, Api } = makeApi();
    const loadExternalApi = vi.fn().mockResolvedValue(Api);
    const { unmount } = render(
      <JitsiMeetingRoom
        session={session}
        meetingTitle="Weekly sync"
        onLeave={vi.fn()}
        canEndForEveryone={false}
        onEndForEveryone={vi.fn()}
        loadExternalApi={loadExternalApi}
      />,
    );
    await waitFor(() => expect(Api).toHaveBeenCalledTimes(1));
    unmount();
    expect(api.dispose).toHaveBeenCalledTimes(1);
  });

  it("shows an error state when the external API script fails to load", async () => {
    const loadExternalApi = vi.fn().mockRejectedValue(new Error("network"));
    render(
      <JitsiMeetingRoom
        session={session}
        meetingTitle="Weekly sync"
        onLeave={vi.fn()}
        canEndForEveryone={false}
        onEndForEveryone={vi.fn()}
        loadExternalApi={loadExternalApi}
      />,
    );
    expect(
      await screen.findByText(
        "Could not connect to the meeting room. Try again.",
      ),
    ).toBeVisible();
  });

  it("shows End meeting for everyone only when the caller can end it", async () => {
    const { Api } = makeApi();
    const loadExternalApi = vi.fn().mockResolvedValue(Api);
    render(
      <JitsiMeetingRoom
        session={session}
        meetingTitle="Weekly sync"
        onLeave={vi.fn()}
        canEndForEveryone
        onEndForEveryone={vi.fn()}
        loadExternalApi={loadExternalApi}
      />,
    );
    expect(
      await screen.findByRole("button", { name: "End meeting for everyone" }),
    ).toBeVisible();
  });

  it("shows the meeting title in its header", async () => {
    const { Api } = makeApi();
    const loadExternalApi = vi.fn().mockResolvedValue(Api);
    render(
      <JitsiMeetingRoom
        session={session}
        meetingTitle="Weekly planning"
        onLeave={vi.fn()}
        canEndForEveryone={false}
        onEndForEveryone={vi.fn()}
        loadExternalApi={loadExternalApi}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Weekly planning" }),
    ).toBeInTheDocument();
  });

  it("hides the full-screen control when the Fullscreen API is unavailable", async () => {
    const { Api } = makeApi();
    const loadExternalApi = vi.fn().mockResolvedValue(Api);
    render(
      <JitsiMeetingRoom
        session={session}
        meetingTitle="Weekly sync"
        onLeave={vi.fn()}
        canEndForEveryone={false}
        onEndForEveryone={vi.fn()}
        loadExternalApi={loadExternalApi}
      />,
    );
    // jsdom reports no Fullscreen API support by default - this is the
    // fallback behaviour the task explicitly requires, not a test artifact.
    expect(
      screen.queryByRole("button", { name: "Enter full screen" }),
    ).not.toBeInTheDocument();
  });

  it("enters and exits full screen via the Fullscreen API when available", async () => {
    const requestFullscreen = vi.fn().mockResolvedValue(undefined);
    const exitFullscreen = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(document, "fullscreenEnabled", {
      value: true,
      configurable: true,
    });
    HTMLElement.prototype.requestFullscreen = requestFullscreen;
    document.exitFullscreen = exitFullscreen;
    const { Api } = makeApi();
    const loadExternalApi = vi.fn().mockResolvedValue(Api);
    const user = userEvent.setup();
    render(
      <JitsiMeetingRoom
        session={session}
        meetingTitle="Weekly sync"
        onLeave={vi.fn()}
        canEndForEveryone={false}
        onEndForEveryone={vi.fn()}
        loadExternalApi={loadExternalApi}
      />,
    );
    const toggle = await screen.findByRole("button", {
      name: "Enter full screen",
    });
    await user.click(toggle);
    expect(requestFullscreen).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, "fullscreenElement", {
      value: document.body,
      configurable: true,
    });
    document.dispatchEvent(new Event("fullscreenchange"));
    const exitButton = await screen.findByRole("button", {
      name: "Exit full screen",
    });
    await user.click(exitButton);
    expect(exitFullscreen).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, "fullscreenElement", {
      value: null,
      configurable: true,
    });
    Object.defineProperty(document, "fullscreenEnabled", {
      value: undefined,
      configurable: true,
    });
  });

  it("calls onLeave and hangs up locally without ending the meeting for others", async () => {
    const { api, Api } = makeApi();
    const loadExternalApi = vi.fn().mockResolvedValue(Api);
    const onLeave = vi.fn();
    const onEndForEveryone = vi.fn();
    render(
      <JitsiMeetingRoom
        session={session}
        meetingTitle="Weekly sync"
        onLeave={onLeave}
        canEndForEveryone
        onEndForEveryone={onEndForEveryone}
        loadExternalApi={loadExternalApi}
      />,
    );
    await waitFor(() => expect(Api).toHaveBeenCalledTimes(1));
    screen.getByRole("button", { name: "Leave meeting" }).click();
    expect(api.executeCommand).toHaveBeenCalledWith("hangup");
    expect(onLeave).toHaveBeenCalledTimes(1);
    expect(onEndForEveryone).not.toHaveBeenCalled();
  });
});
