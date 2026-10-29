import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  accessKey,
  type CurrentAccess,
} from "@/features/auth/api/access-queries";
import { CampaignsScreen } from "./campaigns-screen";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api/browser", () => ({
  browserApi: {
    GET: get,
    POST: vi.fn(),
    PATCH: vi.fn(),
    PUT: vi.fn(),
    DELETE: vi.fn(),
  },
}));

const fullAccess: CurrentAccess = {
  userId: "account-1",
  grants: [{ permissionKey: "campaign.read", scope: "ORGANIZATION" }],
} as CurrentAccess;

let currentAccess: CurrentAccess | null;
let permissionsFail: boolean;

beforeEach(() => {
  get.mockReset();
  currentAccess = fullAccess;
  permissionsFail = false;
  get.mockImplementation(async (path: string) => {
    if (path === "/api/v1/auth/me/permissions") {
      if (permissionsFail) {
        return { data: undefined, response: { status: 500 } };
      }
      return {
        data: currentAccess,
        response: { status: currentAccess ? 200 : 401 },
      };
    }
    if (path === "/api/v1/campaigns") {
      return {
        data: { items: [], page: 1, pageSize: 10, total: 0 },
        response: { ok: true, status: 200 },
      };
    }
    return {
      data: { items: [], page: 1, pageSize: 100, total: 0 },
      response: { ok: true, status: 200 },
    };
  });
});

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <CampaignsScreen />
    </QueryClientProvider>,
  );
}

describe("CampaignsScreen access boundary", () => {
  it("hydrates without replacing public content when the shell has warmed access", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const element = (
      <QueryClientProvider client={client}>
        <section>
          <h1>Campaigns</h1>
          <CampaignsScreen />
        </section>
      </QueryClientProvider>
    );
    const container = document.createElement("div");
    container.innerHTML = renderToString(element);
    expect(container.textContent).toContain("Checking permissions");
    const heading = container.querySelector("h1");
    document.body.append(container);
    client.setQueryData(accessKey, fullAccess);
    const onRecoverableError = vi.fn();
    let root: ReturnType<typeof hydrateRoot> | undefined;
    try {
      await act(async () => {
        root = hydrateRoot(container, element, { onRecoverableError });
      });
      await within(container).findByText("0 campaigns");
      expect(onRecoverableError).not.toHaveBeenCalled();
      expect(container.querySelector("h1")).toBe(heading);
      expect(
        get.mock.calls.filter(
          ([path]) => path === "/api/v1/auth/me/permissions",
        ),
      ).toHaveLength(0);
    } finally {
      await act(async () => root?.unmount());
      client.clear();
      container.remove();
    }
  });
  it("announces the permission check while it runs", () => {
    get.mockImplementation(() => new Promise(() => undefined));
    setup();

    expect(screen.getByText("Checking permissions…")).toBeVisible();
  });

  it("renders the manager once an organization-scoped campaign read grant is confirmed", async () => {
    setup();

    expect(await screen.findByText("0 campaigns")).toBeVisible();
  });

  it("renders the manager for a department-scoped reader (e.g. the Marketing Manager)", async () => {
    currentAccess = {
      userId: "account-1",
      grants: [{ permissionKey: "campaign.read", scope: "DEPARTMENT" }],
    } as CurrentAccess;
    setup();

    expect(await screen.findByText("0 campaigns")).toBeVisible();
  });

  it("denies a caller with no campaign read grant and never lists campaigns", async () => {
    currentAccess = {
      userId: "account-1",
      grants: [],
    } as unknown as CurrentAccess;
    setup();

    expect(
      await screen.findByText("You do not have access to this area."),
    ).toBeVisible();
    expect(get).not.toHaveBeenCalledWith(
      "/api/v1/campaigns",
      expect.anything(),
    );
  });

  it("shows the session-expired recovery path", async () => {
    currentAccess = null;
    setup();

    expect(await screen.findByText(/Your session expired/)).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Sign in in another tab" }),
    ).toHaveAttribute("href", "/login?next=%2Fcampaigns");
    expect(
      screen.getByRole("button", { name: "I have signed in" }),
    ).toBeVisible();
  });

  it("recovers from a failed permission check", async () => {
    permissionsFail = true;
    setup();

    expect(
      await screen.findByText(
        "We could not check your permissions. Try again.",
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Check permissions again" }),
    ).toBeVisible();
  });
});
