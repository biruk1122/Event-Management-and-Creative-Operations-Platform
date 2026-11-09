import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CurrentAccess } from "@/features/auth/api/access-queries";

import type { CreativeRequest } from "../lib/creative-requests-types";
import { CreativeRequestDetail } from "./creative-request-detail";
import { CreativeRequestsScreen } from "./creative-requests-screen";
import { CreateCreativeRequestDialog } from "./create-creative-request-dialog";

const state = vi.hoisted(() => ({
  access: null as unknown,
  search: "",
  replace: vi.fn(),
}));
const gateway = vi.hoisted(() => ({
  listCreativeRequests: vi.fn(),
  getCreativeRequest: vi.fn(),
  moveCreativeRequest: vi.fn(),
  listCreativeRequestFeedback: vi.fn(),
  addCreativeRequestFeedback: vi.fn(),
  listCreativeRequestFiles: vi.fn(),
  uploadCreativeRequestFile: vi.fn(),
  downloadCreativeRequestFile: vi.fn(),
  createCreativeRequest: vi.fn(),
}));

vi.mock("@/features/auth/api/access-queries", () => ({
  useCurrentAccess: () => state.access,
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/creative-requests",
  useSearchParams: () => new URLSearchParams(state.search),
  useRouter: () => ({ replace: state.replace }),
}));
vi.mock("../api/creative-requests-gateway", () => gateway);
vi.mock("@/features/campaigns/api/campaigns-gateway", () => ({
  listCampaigns: () =>
    Promise.resolve({
      items: [{ id: "camp-1", name: "Festival launch" }],
      page: 1,
      pageSize: 100,
      total: 1,
    }),
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function signedIn(data: Partial<CurrentAccess>) {
  state.access = {
    isPending: false,
    isError: false,
    data: {
      userId: "user-1",
      role: "DEPARTMENT_MANAGER",
      department: { id: "dept-promo", name: "Promotion", active: true },
      grants: ["creative_request.read", "creative_request.create"].map(
        (permissionKey) => ({ permissionKey, scope: "DEPARTMENT" }),
      ),
      overseenDepartments: [],
      ...data,
    },
    refetch: vi.fn(),
  };
}

function request(overrides: Partial<CreativeRequest> = {}): CreativeRequest {
  return {
    id: "req-1",
    title: "Festival poster",
    assetType: "POSTER",
    requirements: "A2 portrait.",
    dueAt: null,
    status: "SUBMITTED",
    requestingDepartment: { id: "dept-promo", name: "Promotion" },
    targetDepartment: { id: "dept-prod", name: "Production" },
    campaign: null,
    event: null,
    task: null,
    requestedBy: {
      id: "user-1",
      email: "promo@example.test",
      firstName: "Pat",
      lastName: "Lee",
    },
    declineReason: null,
    respondedAt: null,
    deliveredAt: null,
    reviewedAt: null,
    createdAt: "2030-01-01T09:00:00.000Z",
    updatedAt: "2030-01-01T09:00:00.000Z",
    abilities: {
      moves: ["ACCEPTED", "DECLINED"],
      canAddFeedback: true,
      canAttach: [],
      readOnly: false,
    },
    ...overrides,
  };
}

beforeEach(() => {
  state.search = "";
  state.replace.mockReset();
  Object.values(gateway).forEach((fn) => fn.mockReset());
  gateway.listCreativeRequestFeedback.mockResolvedValue({
    items: [],
    page: 1,
    pageSize: 100,
    total: 0,
  });
  gateway.listCreativeRequestFiles.mockResolvedValue({
    items: [],
    page: 1,
    pageSize: 100,
    total: 0,
  });
});

describe("CreativeRequestsScreen", () => {
  it("lists requests and opens one from the URL", async () => {
    signedIn({});
    gateway.listCreativeRequests.mockResolvedValue({
      items: [request()],
      page: 1,
      pageSize: 25,
      total: 1,
    });
    gateway.getCreativeRequest.mockResolvedValue(request());
    state.search = "request=req-1";
    render(<CreativeRequestsScreen />, { wrapper });
    expect(
      await screen.findByRole("button", { name: /Festival poster/ }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: "Festival poster" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept" })).toBeInTheDocument();
  });

  it("shows an empty state, and New request only to the sending side", async () => {
    signedIn({});
    gateway.listCreativeRequests.mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 25,
      total: 0,
    });
    const { unmount } = render(<CreativeRequestsScreen />, { wrapper });
    expect(
      await screen.findByText("No creative requests match."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "New request" }),
    ).toBeInTheDocument();
    unmount();

    // A Production manager holds the same key but does not send requests.
    signedIn({
      department: { id: "dept-prod", name: "Production", active: true },
    });
    const production = render(<CreativeRequestsScreen />, { wrapper });
    await screen.findByText("No creative requests match.");
    expect(
      screen.queryByRole("button", { name: "New request" }),
    ).not.toBeInTheDocument();
    production.unmount();

    // Oversight hides it whatever the grants, and the direction filter too:
    // sent and received are relative to the viewer's own department.
    signedIn({});
    render(<CreativeRequestsScreen readOnly />, { wrapper });
    await screen.findByText("No creative requests match.");
    expect(
      screen.queryByRole("button", { name: "New request" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "Direction" }),
    ).not.toBeInTheDocument();
  });

  it("refuses a viewer without the read permission", () => {
    signedIn({ grants: [] });
    render(<CreativeRequestsScreen />, { wrapper });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "You do not have access to creative requests.",
    );
  });

  it("shows a retry when the list fails", async () => {
    signedIn({});
    gateway.listCreativeRequests.mockRejectedValue(new Error("Server down"));
    render(<CreativeRequestsScreen />, { wrapper });
    expect(await screen.findByText("Server down")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
  });
});

describe("CreativeRequestDetail", () => {
  it("asks for a reason before declining", async () => {
    const onChanged = vi.fn();
    gateway.moveCreativeRequest.mockResolvedValue(
      request({ status: "DECLINED", declineReason: "No capacity." }),
    );
    render(
      <CreativeRequestDetail
        request={request()}
        queryKey={["test"]}
        onChanged={onChanged}
      />,
      { wrapper },
    );
    await userEvent.click(screen.getByRole("button", { name: "Decline" }));
    const reason = screen.getByLabelText("Why are you declining it?");
    await userEvent.click(
      screen.getAllByRole("button", { name: "Decline" }).at(-1)!,
    );
    expect(gateway.moveCreativeRequest).not.toHaveBeenCalled();
    await userEvent.type(reason, "No capacity.");
    await userEvent.click(
      screen.getAllByRole("button", { name: "Decline" }).at(-1)!,
    );
    await waitFor(() =>
      expect(gateway.moveCreativeRequest).toHaveBeenCalledWith(
        "req-1",
        "DECLINED",
        { reason: "No capacity." },
      ),
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("shows no actions or forms when the viewer only oversees it", async () => {
    render(
      <CreativeRequestDetail
        request={request({
          abilities: {
            moves: [],
            canAddFeedback: false,
            canAttach: [],
            readOnly: true,
          },
        })}
        queryKey={["test"]}
        onChanged={vi.fn()}
      />,
      { wrapper },
    );
    expect(screen.getByText("View only")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Accept" })).toBeNull();
    expect(screen.queryByLabelText("Add feedback")).toBeNull();
    expect(await screen.findByText("No files yet.")).toBeInTheDocument();
  });

  it("asks for a deliverable file before delivering (EVE-233)", async () => {
    render(
      <CreativeRequestDetail
        request={request({
          status: "IN_PROGRESS",
          abilities: {
            moves: ["DELIVERED"],
            canAddFeedback: true,
            canAttach: ["DELIVERABLE"],
            readOnly: false,
          },
        })}
        queryKey={["test"]}
        onChanged={vi.fn()}
      />,
      { wrapper },
    );
    await screen.findByText("No files yet.");
    await userEvent.click(screen.getByRole("button", { name: "Deliver" }));
    expect(
      screen.getByText(
        "Attach at least one deliverable file before delivering.",
      ),
    ).toBeInTheDocument();
    expect(gateway.moveCreativeRequest).not.toHaveBeenCalled();
  });

  it("offers uploads only for the kinds the viewer may add", async () => {
    render(
      <CreativeRequestDetail
        request={request({
          status: "IN_PROGRESS",
          abilities: {
            moves: ["DELIVERED"],
            canAddFeedback: true,
            canAttach: ["DELIVERABLE"],
            readOnly: false,
          },
        })}
        queryKey={["test"]}
        onChanged={vi.fn()}
      />,
      { wrapper },
    );
    expect(screen.getByText("Add deliverable")).toBeInTheDocument();
    expect(screen.queryByText("Add reference")).toBeNull();
    expect(screen.getByRole("button", { name: "Deliver" })).toBeInTheDocument();
  });
});

describe("CreateCreativeRequestDialog", () => {
  it("needs a title and requirements, then sends the request", async () => {
    const create = vi.fn().mockResolvedValue(request());
    const onCreated = vi.fn();
    render(
      <CreateCreativeRequestDialog
        open
        onOpenChange={vi.fn()}
        onCreated={onCreated}
        create={create}
      />,
      { wrapper },
    );
    await userEvent.type(screen.getByLabelText("Title"), "Festival poster");
    await userEvent.type(screen.getByLabelText("Requirements"), "A2 portrait.");
    await userEvent.click(screen.getByRole("button", { name: "Send request" }));
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({
        title: "Festival poster",
        assetType: "POSTER",
        requirements: "A2 portrait.",
      }),
    );
    expect(onCreated).toHaveBeenCalled();
  });
});
