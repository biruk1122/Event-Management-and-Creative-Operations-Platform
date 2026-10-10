import { beforeEach, describe, expect, it, vi } from "vitest";
import { entryAccess } from "./entry-access";
import Home from "@/app/page";
import LoginPage from "@/app/login/page";

const { get, serverApi, cookieString, redirect } = vi.hoisted(() => ({
  get: vi.fn(),
  serverApi: vi.fn(),
  cookieString: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ toString: cookieString }),
}));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/api/server", () => ({ createServerApi: serverApi }));
vi.mock("@/features/auth", () => ({
  AuthShell: () => null,
  Login: () => null,
}));
const access = { userId: "account", grants: [] };
beforeEach(() => {
  vi.clearAllMocks();
  serverApi.mockReturnValue({ GET: get });
  cookieString.mockReturnValue("session=existing");
});
describe("entry session checks", () => {
  it("forwards cookies and checks the API without caching", async () => {
    get.mockResolvedValue({ data: access, response: { status: 200 } });
    expect(await entryAccess()).toBe(access);
    expect(serverApi).toHaveBeenCalledWith({ cookie: "session=existing" });
    expect(get).toHaveBeenCalledWith("/api/v1/auth/me/permissions", {
      cache: "no-store",
    });
  });
  it("does not authenticate an expired cookie", async () => {
    get.mockResolvedValue({ response: { status: 401 } });
    expect(await entryAccess()).toBeNull();
    await expect(Home()).rejects.toThrow("redirect:/login?next=/");
  });
  it("routes authenticated root and login to dashboard", async () => {
    get.mockResolvedValue({ data: access, response: { status: 200 } });
    await expect(Home()).rejects.toThrow("redirect:/dashboard");
    await expect(
      LoginPage({
        searchParams: Promise.resolve({ next: "/login" }),
        params: Promise.resolve({}),
      }),
    ).rejects.toThrow("redirect:/dashboard");
  });
  it("renders signed-out login without a redirect loop", async () => {
    get.mockResolvedValue({ response: { status: 401 } });
    expect(
      await LoginPage({
        searchParams: Promise.resolve({ next: "/" }),
        params: Promise.resolve({}),
      }),
    ).toBeTruthy();
    expect(redirect).not.toHaveBeenCalled();
  });
  it("uses the error boundary on an outage instead of pretending signed out", async () => {
    get.mockResolvedValue({ response: { status: 503 } });
    await expect(Home()).rejects.toThrow("We could not check your session");
    expect(redirect).not.toHaveBeenCalled();
  });
});
