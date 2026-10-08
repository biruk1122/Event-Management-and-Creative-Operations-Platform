"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  CheckSquare,
  CalendarDays,
  MessagesSquare,
  Video,
  ListTodo,
  CalendarRange,
  FolderKanban,
  Clapperboard,
  Megaphone,
  Star,
  FileText,
  ChartNoAxesCombined,
  Users,
  Building2,
  UserRound,
  ShieldCheck,
  Layers3,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  ArrowLeft,
} from "lucide-react";
import { BrandLogo } from "@/components/branding/brand-logo";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  useCurrentAccess,
  type CurrentAccess,
} from "@/features/auth/api/access-queries";
import {
  useCurrentUser,
  useLogoutMutation,
} from "@/features/auth/api/auth-queries";
import { SignOutButton } from "@/features/auth/components/sign-out-button";
import { NotificationsBell } from "@/features/notifications/components/notifications-navigation";
import { cn } from "@/lib/utils";
import {
  activeDestination,
  destinations,
  mobileDestinations,
  type Destination,
} from "./navigation";
import { useSidebarPreference } from "./sidebar-preference";

const icons = {
  dashboard: LayoutDashboard,
  tasks: CheckSquare,
  calendar: CalendarDays,
  discuss: MessagesSquare,
  meetings: Video,
  todo: ListTodo,
  events: CalendarRange,
  projects: FolderKanban,
  production: Clapperboard,
  campaigns: Megaphone,
  talent: Star,
  reports: FileText,
  analytics: ChartNoAxesCombined,
  teams: Users,
  departments: Building2,
  users: UserRound,
  roles: ShieldCheck,
  workspaces: Layers3,
};

function NavigationLinks({
  items,
  pathname,
  rail = false,
  onNavigate,
}: {
  items: Destination[];
  pathname: string;
  rail?: boolean;
  onNavigate?: () => void;
}) {
  const active = activeDestination(items, pathname);
  return (
    <ul className="space-y-1">
      {items.map((item, index) => {
        const Icon = icons[item.icon];
        const selected = active?.href === item.href;
        const newGroup = index === 0 || items[index - 1]?.group !== item.group;
        return (
          <li key={item.href}>
            {newGroup ? (
              <p
                className={cn(
                  "px-3 pt-5 pb-2 text-xs font-semibold tracking-wider uppercase",
                  rail && "shell-rail-label",
                )}
              >
                {item.group}
              </p>
            ) : null}
            <Link
              href={item.href}
              prefetch={false}
              onClick={() => onNavigate?.()}
              aria-label={item.label}
              aria-current={selected ? "page" : undefined}
              title={item.label}
              className={cn(
                "shell-navigation-link flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium outline-offset-2",
                selected && "shell-navigation-active",
              )}
            >
              <Icon aria-hidden="true" className="size-5 shrink-0" />
              <span
                className={cn(
                  "min-w-0 break-words",
                  rail && "shell-rail-label",
                )}
              >
                {item.label}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function NavigationDrawer({
  items,
  pathname,
  mobile = false,
}: {
  items: Destination[];
  pathname: string;
  mobile?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className={mobile ? "shell-mobile-more" : "shell-menu-trigger"}
          aria-label="Open navigation"
        >
          <Menu aria-hidden="true" />
          <span className={mobile ? "text-xs" : "sr-only"}>More</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="shell-drawer">
        <DialogHeader>
          <DialogTitle>Navigation</DialogTitle>
          <DialogDescription>
            Choose an area available to your account.
          </DialogDescription>
        </DialogHeader>
        <nav aria-label="Primary drawer">
          <NavigationLinks
            items={items}
            pathname={pathname}
            onNavigate={() => setOpen(false)}
          />
        </nav>
      </DialogContent>
    </Dialog>
  );
}

function ShellFrame({
  access,
  accountName,
  utility,
  children,
  pathname,
}: {
  access: CurrentAccess | null;
  accountName?: string | undefined;
  utility: ReactNode;
  children: ReactNode;
  pathname: string;
}) {
  const items = access ? destinations(access) : [];
  const active = activeDestination(items, pathname);
  const title =
    pathname === "/"
      ? "Home"
      : pathname === "/notifications"
        ? "Notifications"
        : (active?.label ?? "Workspace");
  const { collapsed, toggle } = useSidebarPreference(
    access?.userId ?? "signed-out",
  );
  const contentRef = useRef<HTMLDivElement>(null);
  const announcementRef = useRef<HTMLParagraphElement>(null);
  const previousPath = useRef(pathname);
  // Observe streamed RSC content; URL filters/access refreshes do not move focus.
  useEffect(() => {
    if (previousPath.current === pathname) return;
    previousPath.current = pathname;
    const content = contentRef.current;
    if (!content) return;
    const focusHeading = () => {
      const heading = content.querySelector<HTMLElement>("h1");
      if (!heading || heading.closest('[aria-busy="true"]')) return;
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
      if (announcementRef.current)
        announcementRef.current.textContent = `${heading.textContent ?? "Workspace"} page`;
      observer.disconnect();
    };
    const observer = new MutationObserver(focusHeading);
    observer.observe(content, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-busy"],
    });
    const frame = requestAnimationFrame(focusHeading);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [pathname]);
  const nested = active && pathname !== active.href;
  const drawerKey = `${pathname}:${access?.userId ?? "none"}:${items.map((i) => i.href).join(",")}`;
  return (
    <div className={cn("application-shell", collapsed && "shell-collapsed")}>
      <a href="#shell-content" className="shell-skip-link">
        Skip to main content
      </a>
      <aside className="shell-sidebar">
        <div className="shell-brand">
          <BrandLogo compact className="shell-rail-logo" />
          <BrandLogo compact={collapsed} className="shell-logo" />
          <p className="shell-brand-caption">Creative management</p>
        </div>
        <nav aria-label="Primary" className="shell-sidebar-navigation">
          {items.length ? (
            <NavigationLinks
              items={items}
              pathname={pathname}
              rail={collapsed}
            />
          ) : (
            <p className="p-3 text-sm">
              Navigation appears after access is verified.
            </p>
          )}
        </nav>
        <Button
          variant="ghost"
          onClick={toggle}
          className="shell-collapse-trigger"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
        >
          {collapsed ? (
            <PanelLeftOpen aria-hidden="true" />
          ) : (
            <PanelLeftClose aria-hidden="true" />
          )}
          <span className="shell-rail-label">Collapse sidebar</span>
        </Button>
      </aside>
      <div className="shell-workspace">
        <header className="shell-header">
          <div className="flex min-w-0 items-center gap-3">
            <div className="shell-header-logo">
              <BrandLogo compact className="h-10 w-7" />
            </div>
            <div className="min-w-0">
              <p className="text-muted-foreground text-xs">
                Lela Creative Management
              </p>
              <p className="font-semibold break-words">{title}</p>
            </div>
          </div>
          <nav
            aria-label="Account and notifications"
            className="flex shrink-0 flex-wrap items-center justify-end gap-1 sm:gap-3"
          >
            {accountName ? (
              <span
                className="hidden max-w-40 truncate text-sm lg:inline"
                title={accountName}
              >
                {accountName}
              </span>
            ) : null}
            {utility}
          </nav>
        </header>
        <div className="shell-route-toolbar">
          <div className="min-w-0">
            {nested ? (
              <nav aria-label="Breadcrumb">
                <Link
                  href={active.href}
                  prefetch={false}
                  className="inline-flex min-h-9 items-center gap-2 text-sm underline underline-offset-4"
                >
                  <ArrowLeft aria-hidden="true" className="size-4" />
                  Back to {active.label}
                </Link>
              </nav>
            ) : (
              <p className="text-muted-foreground text-sm">
                Your connected workspace
              </p>
            )}
          </div>
          <NavigationDrawer key={drawerKey} items={items} pathname={pathname} />
        </div>
        <p
          ref={announcementRef}
          className="sr-only"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        />
        <div
          id="shell-content"
          tabIndex={-1}
          ref={contentRef}
          className="min-w-0 outline-offset-4"
        >
          {children}
        </div>
      </div>
      {access ? (
        <nav aria-label="Primary mobile" className="shell-mobile-navigation">
          {mobileDestinations(items).map((item) => {
            const Icon = icons[item.icon];
            const selected =
              item.icon === "discuss"
                ? pathname.startsWith("/discuss/")
                : active?.href === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={false}
                aria-current={selected ? "page" : undefined}
                className={cn(
                  "flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-lg px-1 text-xs font-medium",
                  selected && "bg-secondary text-secondary-foreground",
                )}
              >
                <Icon aria-hidden="true" className="size-5" />
                {item.label}
              </Link>
            );
          })}
          <NavigationDrawer
            key={drawerKey}
            items={items}
            pathname={pathname}
            mobile
          />
        </nav>
      ) : null}
    </div>
  );
}

function AuthorizedShell({
  children,
  pathname,
}: {
  children: ReactNode;
  pathname: string;
}) {
  const access = useCurrentAccess();
  const account = useCurrentUser();
  const logout = useLogoutMutation();
  const router = useRouter();
  const [signOutError, setSignOutError] = useState(false);
  const verified =
    !logout.isPending &&
    !access.isFetching &&
    !access.isPaused &&
    !access.isError &&
    !account.isError &&
    account.data &&
    access.data?.userId === account.data.id
      ? access.data
      : null;
  return (
    <ShellFrame
      access={verified}
      pathname={pathname}
      accountName={verified ? account.data?.email : undefined}
      utility={
        <>
          {verified?.grants.some(
            (g) => g.permissionKey === "notification.read",
          ) ? (
            <NotificationsBell access={verified} inline />
          ) : null}
          {account.data ? (
            <SignOutButton
              onSignOut={async () => {
                setSignOutError(false);
                try {
                  await logout.mutateAsync();
                  router.replace("/login");
                  router.refresh();
                } catch {
                  setSignOutError(true);
                }
              }}
            />
          ) : (
            <Link
              href="/login"
              className="inline-flex min-h-11 items-center px-3 text-sm underline"
            >
              Sign in
            </Link>
          )}
        </>
      }
    >
      {access.isError || account.isError ? (
        <div role="alert" className="mx-4 rounded-xl border p-4">
          <p>We could not verify your account navigation.</p>
          <Button
            variant="outline"
            onClick={() => {
              void access.refetch();
              void account.refetch();
            }}
          >
            Check access again
          </Button>
        </div>
      ) : null}
      {access.isPending || account.isPending ? (
        <p role="status" className="px-4 text-sm">
          Checking account access…
        </p>
      ) : null}
      {signOutError ? (
        <p role="alert" className="px-4">
          Sign-out could not be confirmed. Sign in again or retry.
        </p>
      ) : null}
      {children}
    </ShellFrame>
  );
}

/** One root shell; login remains outside the authenticated chrome. */
export function ApplicationShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/login") return children;
  return <AuthorizedShell pathname={pathname}>{children}</AuthorizedShell>;
}
