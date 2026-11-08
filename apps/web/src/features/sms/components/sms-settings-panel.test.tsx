import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SmsSettingsPanel } from "./sms-settings-panel";

const { get, post, patch } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
}));
vi.mock("@/lib/api/browser", () => ({
  browserApi: { GET: get, POST: post, PATCH: patch },
}));
vi.mock("@/lib/api/csrf", () => ({ readCsrfToken: () => "csrf-token-1" }));

const off = {
  environmentEnabled: true,
  globalEnabled: false,
  effectiveEnabled: false,
  categories: [
    { category: "TASK_ASSIGNED", enabled: true },
    { category: "MEETING_REMINDER", enabled: false },
  ],
  updatedAt: null,
  provider: {
    enabled: true,
    apiKeyConfigured: true,
    senderConfigured: true,
    callbackConfigured: false,
    timeoutMs: 10000,
  },
};
const on = { ...off, globalEnabled: true, effectiveEnabled: true };

function setup(canUpdate: boolean) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <SmsSettingsPanel canUpdate={canUpdate} />
    </QueryClientProvider>,
  );
}

describe("SMS settings panel", () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
    patch.mockReset();
    get.mockResolvedValue({ data: off, response: { ok: true, status: 200 } });
  });

  it("starts with delivery off and says so, with the environment switch shown", async () => {
    setup(true);
    expect(await screen.findByText(/SMS is off/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Switch SMS delivery on" }),
    ).toBeEnabled();
  });

  it("never shows secret values, only whether they are configured", async () => {
    setup(true);
    await screen.findByText(/SMS is off/i);
    expect(screen.getByText(/API key yes/)).toBeInTheDocument();
    expect(screen.getByText(/callback no/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/sms-api-key|token-value/);
  });

  it("asks for confirmation before switching global delivery on, and sends nothing until confirmed", async () => {
    const user = userEvent.setup();
    patch.mockResolvedValue({ data: on, response: { ok: true, status: 200 } });
    setup(true);
    await user.click(
      await screen.findByRole("button", { name: "Switch SMS delivery on" }),
    );
    expect(patch).not.toHaveBeenCalled();
    expect(
      await screen.findByRole("heading", { name: "Turn on SMS delivery?" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/real SMS to recipients/)).toBeInTheDocument();
    expect(
      screen.getByText(/Messages cancelled while SMS delivery was off/),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Turn on SMS delivery" }),
    );
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/api/v1/sms/settings", {
        body: { globalEnabled: true },
        headers: { "x-csrf-token": "csrf-token-1" },
      }),
    );
  });

  it("sends nothing when the enable confirmation is dismissed", async () => {
    const user = userEvent.setup();
    setup(true);
    await user.click(
      await screen.findByRole("button", { name: "Switch SMS delivery on" }),
    );
    await user.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(patch).not.toHaveBeenCalled();
  });

  it("switches global delivery off in one step, with no confirmation", async () => {
    const user = userEvent.setup();
    get.mockResolvedValue({ data: on, response: { ok: true, status: 200 } });
    patch.mockResolvedValue({ data: off, response: { ok: true, status: 200 } });
    setup(true);
    await user.click(
      await screen.findByRole("button", { name: "Switch SMS delivery off" }),
    );
    expect(
      screen.queryByRole("heading", { name: "Turn on SMS delivery?" }),
    ).toBeNull();
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/api/v1/sms/settings", {
        body: { globalEnabled: false },
        headers: { "x-csrf-token": "csrf-token-1" },
      }),
    );
  });

  it("asks for confirmation before turning a category on, and says what happens to it", async () => {
    const user = userEvent.setup();
    patch.mockResolvedValue({ data: off, response: { ok: true, status: 200 } });
    setup(true);
    await user.click(
      await screen.findByRole("checkbox", { name: "Meeting reminder" }),
    );
    expect(patch).not.toHaveBeenCalled();
    expect(
      await screen.findByRole("heading", { name: "Turn on Meeting reminder?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/SMS delivery is off, so nothing will be sent/),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Turn on category" }));
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/api/v1/sms/settings", {
        body: { categories: { MEETING_REMINDER: true } },
        headers: { "x-csrf-token": "csrf-token-1" },
      }),
    );
  });

  it("turns a category off without confirmation", async () => {
    const user = userEvent.setup();
    patch.mockResolvedValue({ data: off, response: { ok: true, status: 200 } });
    setup(true);
    await user.click(
      await screen.findByRole("checkbox", { name: "Task assigned" }),
    );
    expect(
      screen.queryByRole("heading", { name: "Turn on Task assigned?" }),
    ).toBeNull();
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/api/v1/sms/settings", {
        body: { categories: { TASK_ASSIGNED: false } },
        headers: { "x-csrf-token": "csrf-token-1" },
      }),
    );
  });

  it("hides every change control from a user without settings.update", async () => {
    setup(false);
    await screen.findByText(/SMS is off/i);
    expect(
      screen.queryByRole("button", { name: "Switch SMS delivery on" }),
    ).toBeNull();
    expect(
      screen.getByRole("checkbox", { name: "Task assigned" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Check connection" }),
    ).toBeDisabled();
  });

  it("shows an error with a retry when settings cannot be loaded", async () => {
    get.mockResolvedValueOnce({
      error: {},
      response: { ok: false, status: 500 },
    });
    setup(true);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /could not load/i,
    );
    expect(
      screen.getByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
  });

  it("checks the connection without sending an SMS, and reports the balance", async () => {
    const user = userEvent.setup();
    post.mockResolvedValue({
      data: { ok: true, balance: "205.65", estimatedMessages: "3577" },
      response: { ok: true, status: 201 },
    });
    setup(true);
    await user.click(
      await screen.findByRole("button", { name: "Check connection" }),
    );
    expect(
      await screen.findByText(/Connected\. Balance 205\.65\./),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/No SMS is sent by this check/),
    ).toBeInTheDocument();
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith("/api/v1/sms/test-connection", {
      headers: { "x-csrf-token": "csrf-token-1" },
    });
  });
});
