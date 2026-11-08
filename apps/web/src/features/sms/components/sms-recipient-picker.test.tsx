import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SmsRecipientPicker } from "./sms-recipient-picker";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api/browser", () => ({
  browserApi: { GET: get, POST: vi.fn(), PATCH: vi.fn() },
}));

const hanna = {
  id: "33333333-3333-4333-8333-333333333333",
  name: "Hanna Bekele",
};

function setup(
  selected: { id: string; name: string } | null,
  onSelect = vi.fn(),
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <SmsRecipientPicker selected={selected} onSelect={onSelect} />
    </QueryClientProvider>,
  );
  return onSelect;
}

describe("SMS recipient picker", () => {
  beforeEach(() => {
    get.mockReset();
    get.mockResolvedValue({
      data: { items: [hanna] },
      response: { ok: true, status: 200 },
    });
  });

  it("does not search until two characters are typed", async () => {
    const user = userEvent.setup();
    setup(null);
    await user.type(screen.getByLabelText("Recipient"), "H");
    expect(get).not.toHaveBeenCalled();
  });

  it("shows matching names with their user ids, and never a phone number", async () => {
    const user = userEvent.setup();
    setup(null);
    await user.type(screen.getByLabelText("Recipient"), "Han");
    expect(
      await screen.findByRole("button", { name: /Hanna Bekele/ }),
    ).toHaveTextContent(hanna.id);
    expect(get).toHaveBeenCalledWith(
      "/api/v1/sms/recipients",
      expect.objectContaining({ params: { query: { q: "Han" } } }),
    );
    expect(document.body.textContent).not.toMatch(/\+251|09\d{8}/);
  });

  it("reports the chosen recipient and clears the search", async () => {
    const user = userEvent.setup();
    const onSelect = setup(null);
    await user.type(screen.getByLabelText("Recipient"), "Han");
    await user.click(
      await screen.findByRole("button", { name: /Hanna Bekele/ }),
    );
    expect(onSelect).toHaveBeenCalledWith(hanna);
    expect(screen.getByLabelText("Recipient")).toHaveValue("");
  });

  it("shows the selected recipient and clears it on request", async () => {
    const user = userEvent.setup();
    const onSelect = setup(hanna);
    expect(screen.getByText(/Hanna Bekele/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear recipient" }));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it("says when nothing matches", async () => {
    const user = userEvent.setup();
    get.mockResolvedValue({
      data: { items: [] },
      response: { ok: true, status: 200 },
    });
    setup(null);
    await user.type(screen.getByLabelText("Recipient"), "Zz");
    expect(
      await screen.findByText("No users match that search."),
    ).toBeInTheDocument();
    await waitFor(() => expect(get).toHaveBeenCalled());
  });
});
