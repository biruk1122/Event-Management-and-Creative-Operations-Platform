import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentAccess } from "@/features/auth/api/access-queries";
import type { DocumentRecord } from "../lib/documents-types";
import { DocumentsManager } from "./documents-manager";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api/browser", () => ({
  browserApi: { GET: get, POST: vi.fn(), PATCH: vi.fn(), DELETE: vi.fn() },
}));
const access: CurrentAccess = {
  userId: "admin-1",
  role: "SUPER_ADMIN",
  department: null,
  grants: [
    { permissionKey: "document.read", scope: "ORGANIZATION" },
    { permissionKey: "document.create", scope: "ORGANIZATION" },
    { permissionKey: "document.share", scope: "ORGANIZATION" },
  ],
};
const document: DocumentRecord = {
  id: "doc-1",
  displayName: "Annual budget",
  description: null,
  documentType: "REPORT",
  projectId: null,
  projectName: null,
  fileAvailable: false,
  fileId: null,
  originalFilename: "budget.pdf",
  sizeBytes: 1024,
  uploadedAt: "2026-10-21T09:00:00Z",
  uploadedById: "uploader-1",
  uploadedByName: "Preview Uploader",
  sourceLetterId: null,
  sourceLetterReferenceNumber: null,
  createdAt: "2026-10-21T08:00:00Z",
  updatedAt: "2026-10-21T08:00:00Z",
};

function setup(currentAccess = access) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <DocumentsManager access={currentAccess} />
    </QueryClientProvider>,
  );
  return userEvent.setup();
}
beforeEach(() => {
  get.mockReset();
  get.mockImplementation(async (path: string) => ({
    data:
      path === "/api/v1/documents/options"
        ? { documentTypes: ["REPORT", "CONTRACT"], projects: [] }
        : path === "/api/v1/documents/{id}"
          ? document
          : { items: [document], page: 1, pageSize: 20, total: 1 },
    response: { ok: true, status: 200 },
  }));
});
describe("DocumentsManager library controls", () => {
  it("switches to cards and keeps document detail actions connected", async () => {
    const user = setup();
    await screen.findByText("1 document");
    await user.click(screen.getByRole("button", { name: "Grid layout" }));
    expect(screen.getByRole("button", { name: "Grid layout" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Annual budget/ }));
    expect(
      await screen.findByRole("heading", { name: "Annual budget" }),
    ).toBeVisible();
    expect(get).toHaveBeenCalledWith(
      "/api/v1/documents/{id}",
      expect.objectContaining({ params: { path: { id: "doc-1" } } }),
    );
  });

  it("hides stale upload metadata when the file is not available", async () => {
    const user = setup();
    await screen.findByText("1 document");
    await user.click(screen.getByRole("button", { name: "Grid layout" }));
    expect(screen.getByText("Awaiting file upload")).toBeVisible();
    expect(screen.queryByText("budget.pdf")).not.toBeInTheDocument();
    expect(screen.queryByText("Preview Uploader")).not.toBeInTheDocument();
    expect(screen.queryByText(/KB/)).not.toBeInTheDocument();
  });

  it("clears search and document type and requests the first unfiltered page", async () => {
    const user = setup();
    await screen.findByText("1 document");
    await user.type(
      screen.getByRole("searchbox", { name: "Search" }),
      "budget",
    );
    await user.click(
      screen.getByRole("combobox", { name: "Filter by document type" }),
    );
    await user.click(screen.getByRole("option", { name: "Report" }));
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith(
        "/api/v1/documents",
        expect.objectContaining({
          params: {
            query: expect.objectContaining({
              search: "budget",
              documentType: "REPORT",
              page: 1,
            }),
          },
        }),
      ),
    );
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByRole("searchbox", { name: "Search" })).toHaveValue("");
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Clear filters" }),
      ).not.toBeInTheDocument(),
    );
    expect(
      get.mock.calls
        .filter(([path]) => path === "/api/v1/documents")
        .at(-1)?.[1].params.query,
    ).toEqual({ page: 1, pageSize: 20, sort: "createdAt", order: "desc" });
  });

  it("keeps registration hidden without a create grant", async () => {
    setup({
      ...access,
      grants: [{ permissionKey: "document.read", scope: "ORGANIZATION" }],
    });
    await screen.findByText("1 document");
    expect(
      screen.queryByRole("button", { name: "New Document" }),
    ).not.toBeInTheDocument();
  });
});
