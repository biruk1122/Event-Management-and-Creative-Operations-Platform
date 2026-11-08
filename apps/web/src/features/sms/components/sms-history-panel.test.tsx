import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SmsHistoryPanel } from "./sms-history-panel";

const { get, post, patch } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
}));
vi.mock("@/lib/api/browser", () => ({
  browserApi: { GET: get, POST: post, PATCH: patch },
}));
vi.mock("@/lib/api/csrf", () => ({ readCsrfToken: () => "csrf-token-1" }));

const uncertainId = "11111111-1111-4111-8111-111111111111";
const recipientId = "33333333-3333-4333-8333-333333333333";
const page = (total: number, items: unknown[]) => ({
  data: { items, total, page: 1, pageSize: 25 },
  response: { ok: true, status: 200 },
});
const row = (overrides: Record<string, unknown>) => ({
  id: "22222222-2222-4222-8222-222222222222",
  category: "TASK_ASSIGNED",
  status: "SKIPPED",
  recipientUserId: recipientId,
  recipientName: "Hanna Bekele",
  recipientPhoneMasked: "+251******344",
  templateKey: "task.assigned",
  body: "LELA: a message",
  skipReason: "INVALID_PHONE_NUMBER",
  providerMessageId: null,
  providerStatus: null,
  providerStatusCheckedAt: null,
  callbackStatus: null,
  attempts: 0,
  lastError: null,
  acceptedAt: null,
  createdAt: "2026-11-02T08:00:00Z",
  ...overrides,
});

function setup(canUpdate = true) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <SmsHistoryPanel canUpdate={canUpdate} />
    </QueryClientProvider>,
  );
}

/** Answers history, recipient search and detail requests from one place. */
function serve(options: {
  items?: unknown[];
  detail?: Record<string, unknown>;
  recipients?: { id: string; name: string }[];
}) {
  get.mockImplementation((path: string) => {
    if (path === "/api/v1/sms/recipients") {
      return Promise.resolve({
        data: { items: options.recipients ?? [] },
        response: { ok: true, status: 200 },
      });
    }
    if (path === "/api/v1/sms/messages/{id}") {
      return Promise.resolve({
        data: options.detail,
        response: { ok: true, status: 200 },
      });
    }
    return Promise.resolve(
      page(options.items?.length ?? 0, options.items ?? []),
    );
  });
}

const uncertainDetail = (overrides: Record<string, unknown> = {}) =>
  row({
    id: uncertainId,
    status: "UNCERTAIN",
    skipReason: null,
    lastError: "UNCERTAIN",
    deliveryAttempts: [
      {
        attemptNumber: 1,
        outcome: "UNCERTAIN",
        providerHttpStatus: null,
        providerResponse: { acknowledge: "error", status: "Send in progress" },
        error: "timed out",
        startedAt: "2026-11-02T08:00:01Z",
        finishedAt: "2026-11-02T08:00:11Z",
      },
    ],
    callbackReceivedAt: null,
    sourceDueAt: null,
    ...overrides,
  });

describe("SMS history panel", () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
    patch.mockReset();
  });

  it("lists messages with masked numbers, distinct statuses and reasons", async () => {
    serve({
      items: [
        row({ id: "a", status: "SKIPPED", skipReason: "INVALID_PHONE_NUMBER" }),
        row({
          id: "b",
          status: "FAILED",
          skipReason: null,
          lastError: "REJECTED",
        }),
      ],
    });
    setup();
    const table = await screen.findByRole("table", {
      name: "SMS history, newest first",
    });
    expect(within(table).getByText("Skipped")).toBeInTheDocument();
    expect(within(table).getByText("Failed")).toBeInTheDocument();
    expect(within(table).getAllByText("+251******344")).toHaveLength(2);
    expect(within(table).queryByText(/0911223344|\+251911223344/)).toBeNull();
  });

  it("shows an empty state when no message matches", async () => {
    serve({ items: [] });
    setup();
    expect(
      await screen.findByText("No SMS messages match these filters."),
    ).toBeInTheDocument();
  });

  it("shows the access message when history is denied", async () => {
    get.mockResolvedValue({ error: {}, response: { ok: false, status: 403 } });
    setup();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You do not have access to this area.",
    );
  });

  it("filters by status", async () => {
    const user = userEvent.setup();
    serve({ items: [] });
    setup();
    await screen.findByText("No SMS messages match these filters.");
    await user.selectOptions(screen.getByLabelText("Status"), "FAILED");
    await waitFor(() =>
      expect(get).toHaveBeenLastCalledWith(
        "/api/v1/sms/messages",
        expect.objectContaining({
          params: {
            query: expect.objectContaining({ status: "FAILED", page: 1 }),
          },
        }),
      ),
    );
  });

  it("filters by a recipient chosen from the picker, sending its user id only", async () => {
    const user = userEvent.setup();
    serve({
      items: [],
      recipients: [{ id: recipientId, name: "Hanna Bekele" }],
    });
    setup();
    await screen.findByText("No SMS messages match these filters.");
    await user.type(screen.getByLabelText("Recipient"), "Hanna");
    await user.click(
      await screen.findByRole("button", { name: /Hanna Bekele/ }),
    );
    await waitFor(() =>
      expect(get).toHaveBeenLastCalledWith(
        "/api/v1/sms/messages",
        expect.objectContaining({
          params: {
            query: expect.objectContaining({ recipientUserId: recipientId }),
          },
        }),
      ),
    );
    const sent = JSON.stringify(get.mock.calls);
    expect(sent).not.toMatch(/911223344|\+251/);
  });

  it("does not request a range that ends before it starts, and says why", async () => {
    const user = userEvent.setup();
    serve({ items: [] });
    setup();
    await screen.findByText("No SMS messages match these filters.");
    await user.type(screen.getByLabelText("Created from"), "2026-05-10");
    await user.type(screen.getByLabelText("Created to"), "2026-05-01");
    expect(
      await screen.findByText(/end date must be on or after/),
    ).toBeInTheDocument();
    const sent = get.mock.calls.at(-1)?.[1] as {
      params: { query: Record<string, unknown> };
    };
    expect(sent.params.query).not.toHaveProperty("createdFrom");
  });

  it("moves between pages", async () => {
    const user = userEvent.setup();
    serve({ items: [row({ id: "a" })] });
    get.mockImplementation(() => Promise.resolve(page(60, [row({ id: "a" })])));
    setup();
    await screen.findByRole("table", { name: "SMS history, newest first" });
    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() =>
      expect(get).toHaveBeenLastCalledWith(
        "/api/v1/sms/messages",
        expect.objectContaining({
          params: { query: expect.objectContaining({ page: 2 }) },
        }),
      ),
    );
  });

  it("shows only the reduced provider fields, with no free text, in the detail", async () => {
    const user = userEvent.setup();
    serve({
      items: [row({ id: uncertainId, status: "UNCERTAIN" })],
      detail: uncertainDetail(),
    });
    setup(false);
    await user.click(
      await screen.findByRole("button", { name: /View details/ }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Attempt 1")).toBeInTheDocument();
    expect(
      within(dialog).getByText(/Provider: error · Send in progress/),
    ).toBeInTheDocument();
    expect(dialog.textContent).not.toMatch(/911223344|\+251911/);
  });

  it("warns not to resend an uncertain message, and hides resolution from users without settings.update", async () => {
    const user = userEvent.setup();
    serve({
      items: [row({ id: uncertainId, status: "UNCERTAIN" })],
      detail: uncertainDetail(),
    });
    setup(false);
    await user.click(
      await screen.findByRole("button", { name: /View details/ }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      "Do not resend this message",
    );
    expect(
      within(dialog).queryByRole("button", { name: "Requeue" }),
    ).toBeNull();
    expect(
      within(dialog).queryByRole("button", { name: "Mark as cancelled" }),
    ).toBeNull();
  });

  it("offers no resolution for a message that is not uncertain", async () => {
    const user = userEvent.setup();
    serve({
      items: [row({ id: uncertainId, status: "FAILED" })],
      detail: row({ id: uncertainId, status: "FAILED", deliveryAttempts: [] }),
    });
    setup(true);
    await user.click(
      await screen.findByRole("button", { name: /View details/ }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).queryByRole("button", { name: "Requeue" }),
    ).toBeNull();
  });

  it("cancels an uncertain message only after confirmation, with a CSRF token", async () => {
    const user = userEvent.setup();
    post.mockResolvedValue({ response: { ok: true, status: 200 } });
    serve({
      items: [row({ id: uncertainId, status: "UNCERTAIN" })],
      detail: uncertainDetail(),
    });
    setup(true);
    await user.click(
      await screen.findByRole("button", { name: /View details/ }),
    );
    const dialog = await screen.findByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Mark as cancelled" }),
    );
    expect(post).not.toHaveBeenCalled();
    const confirm = await screen.findByRole("heading", {
      name: "Mark this message as cancelled?",
    });
    expect(confirm).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Mark as cancelled" }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        "/api/v1/sms/messages/{id}/resolve",
        expect.objectContaining({
          params: { path: { id: uncertainId } },
          body: { decision: "CANCEL" },
          headers: { "x-csrf-token": "csrf-token-1" },
        }),
      ),
    );
  });

  it("requeues only after a warning about duplicates is confirmed, and not when the warning is dismissed", async () => {
    const user = userEvent.setup();
    post.mockResolvedValue({ response: { ok: true, status: 200 } });
    serve({
      items: [row({ id: uncertainId, status: "UNCERTAIN" })],
      detail: uncertainDetail(),
    });
    setup(true);
    await user.click(
      await screen.findByRole("button", { name: /View details/ }),
    );
    const dialog = await screen.findByRole("dialog");

    await user.click(within(dialog).getByRole("button", { name: "Requeue" }));
    expect(
      await screen.findByText(/recipient will get a duplicate/),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(post).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Requeue" }));
    await user.click(screen.getByRole("button", { name: "Requeue message" }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        "/api/v1/sms/messages/{id}/resolve",
        expect.objectContaining({ body: { decision: "REQUEUE" } }),
      ),
    );
  });

  it("shows a clear message when a message can no longer be resolved", async () => {
    const user = userEvent.setup();
    post.mockResolvedValue({
      error: { code: "SMS_MESSAGE_NOT_RESOLVABLE" },
      response: { ok: false, status: 409 },
    });
    serve({
      items: [row({ id: uncertainId, status: "UNCERTAIN" })],
      detail: uncertainDetail(),
    });
    setup(true);
    await user.click(
      await screen.findByRole("button", { name: /View details/ }),
    );
    const dialog = await screen.findByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Mark as cancelled" }),
    );
    await user.click(screen.getByRole("button", { name: "Mark as cancelled" }));
    expect(
      await within(dialog).findByText(/can no longer be resolved/),
    ).toBeInTheDocument();
  });

  it("shows a message for a detail that cannot be loaded", async () => {
    const user = userEvent.setup();
    get.mockImplementation((path: string) =>
      path === "/api/v1/sms/messages/{id}"
        ? Promise.resolve({ error: {}, response: { ok: false, status: 404 } })
        : Promise.resolve(page(1, [row({ id: uncertainId })])),
    );
    setup();
    await user.click(
      await screen.findByRole("button", { name: /View details/ }),
    );
    expect(
      await screen.findByText("That SMS message no longer exists."),
    ).toBeInTheDocument();
  });
});
