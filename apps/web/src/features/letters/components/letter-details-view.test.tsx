import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { LetterDetailsView } from "./letter-details-view";
import type { CurrentAccess } from "@/features/auth/api/access-queries";
import { getLetter, listLetterFiles } from "../api/letters-gateway";
vi.mock("@/lib/api/browser", () => ({ browserApi: { GET: vi.fn() } }));

vi.mock("next/navigation", () => ({
  useSearchParams: () =>
    new URLSearchParams("direction=OUTGOING&letter=letter-1"),
}));
vi.mock("../api/letters-gateway", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/letters-gateway")>()),
  getLetter: vi.fn(),
  listLetterFiles: vi.fn(),
  listRemarks: vi.fn(),
}));
const access: CurrentAccess = {
  userId: "admin",
  role: "SUPER_ADMIN",
  department: null,
  grants: [],
};
beforeEach(() => {
  vi.mocked(getLetter).mockReset().mockResolvedValue({
    id: "letter-1",
    referenceNumber: "LELA-HR-001",
    subject: "Venue confirmation",
    direction: "OUTGOING",
    category: "HR",
    date: "2026-10-22",
    attachmentCount: 0,
    fromParty: null,
    toParty: "Events team",
    projectId: null,
    projectName: null,
    senderReferenceNumber: null,
    shortDescription: "The venue is confirmed.",
    remark: "Signed by admin",
    createdAt: "2026-10-22T00:00:00Z",
    updatedAt: "2026-10-22T00:00:00Z",
    createdById: null,
    createdByName: "Admin",
    updatedById: null,
  });
  vi.mocked(listLetterFiles).mockReset().mockResolvedValue([]);
});
function setup() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <LetterDetailsView access={access} letterId="letter-1" />
    </QueryClientProvider>,
  );
}
it("shows letter information without opening an edit form and preserves the return direction", async () => {
  setup();
  expect(
    await screen.findByRole("heading", { name: "Venue confirmation" }),
  ).toBeInTheDocument();
  expect(screen.getByText("Events team")).toBeInTheDocument();
  expect(screen.getByText("The venue is confirmed.")).toBeInTheDocument();
  expect(screen.getByText("Signed by admin")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Back to letters" })).toHaveAttribute(
    "href",
    "/letters?direction=OUTGOING",
  );
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Save changes" }),
  ).not.toBeInTheDocument();
  expect(await screen.findByText("No attachments yet.")).toBeInTheDocument();
});
it("does not display an empty edit form when a letter is missing", async () => {
  vi.mocked(getLetter).mockResolvedValue(null);
  setup();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "This letter no longer exists.",
  );
  expect(listLetterFiles).not.toHaveBeenCalled();
});
