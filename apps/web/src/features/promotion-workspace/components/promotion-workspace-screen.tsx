"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  CalendarDays,
  CheckSquare,
  ClipboardList,
  Eye,
  FileText,
  Handshake,
  LayoutGrid,
  Megaphone,
  Palette,
  Ticket,
  Wallet,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useCurrentAccess } from "@/features/auth/api/access-queries";
import { CampaignsScreen } from "@/features/campaigns/components/campaigns-screen";
import { PartnersScreen } from "@/features/partners/components/partners-screen";
import { ReportsScreen } from "@/features/reports/components/reports-screen";
import { TasksScreen } from "@/features/tasks/components/tasks-screen";

import {
  canEnterPromotionWorkspace,
  promotionSections,
  promotionWorkspaceContext,
  resolvePromotionSection,
  type PromotionSection,
  type PromotionSectionDefinition,
} from "../lib/promotion-workspace-access";

const LOGIN_HREF = "/login?next=%2Fpromotion";

const SECTION_ICONS: Record<PromotionSection, typeof LayoutGrid> = {
  overview: LayoutGrid,
  campaigns: Megaphone,
  activities: ClipboardList,
  tasks: CheckSquare,
  partnerships: Handshake,
  "creative-requests": Palette,
  "event-promotions": Ticket,
  budget: Wallet,
  reports: FileText,
  calendar: CalendarDays,
};

const SECTION_SUMMARIES: Record<PromotionSection, string> = {
  overview: "Where the Promotion department's work stands.",
  campaigns:
    "Promotional campaigns, their approval and status, activities and progress.",
  activities:
    "Street promotions, flyer runs, media slots and other activities, by list and calendar.",
  tasks: "The Promotion team's tasks, deadlines and reviews.",
  partnerships: "Brands, influencers, media and other promotional partners.",
  "creative-requests":
    "Posters, flyers, videos and other materials requested from Production.",
  "event-promotions": "Upcoming events and the campaigns promoting them.",
  budget: "Campaign and activity budgets, expenses and receipts.",
  reports: "Daily, weekly and monthly reports sent to the Marketing Manager.",
  calendar: "Campaign dates, activities and task deadlines in one view.",
};

/**
 * The Promotional Manager workspace (EVE-229): one place for the Promotion
 * department's work. Phase 1 delivers the structure, navigation and access;
 * sections reuse the platform's existing modules, and the sections still to
 * come say so instead of showing anything made up.
 */
export function PromotionWorkspaceScreen() {
  const access = useCurrentAccess();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  if (access.isPending) {
    return <p role="status">Checking permissions…</p>;
  }

  if (access.isError) {
    return (
      <div role="alert" className="space-y-2">
        <p>{access.error.message}</p>
        <Button variant="outline" onClick={() => void access.refetch()}>
          Check permissions again
        </Button>
      </div>
    );
  }

  if (access.data === null) {
    return (
      <div role="alert" className="space-y-2">
        <p>Your session expired.</p>
        <Link
          href={LOGIN_HREF}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm underline underline-offset-4"
        >
          Sign in in another tab
        </Link>
        <Button variant="outline" onClick={() => void access.refetch()}>
          I have signed in
        </Button>
      </div>
    );
  }

  const data = access.data;

  if (!canEnterPromotionWorkspace(data)) {
    return <p role="alert">You do not have access to this area.</p>;
  }

  const context = promotionWorkspaceContext(data);
  if (!context) {
    return (
      <p role="alert">
        Ask Super Admin to assign you to an active department before accessing
        department work.
      </p>
    );
  }

  const sections = promotionSections(data);
  const current = resolvePromotionSection(data, params.get("tab"));
  const select = (section: PromotionSection) => {
    const next = new URLSearchParams(params.toString());
    if (section === "overview") next.delete("tab");
    else next.set("tab", section);
    const query = next.toString();
    router.replace(`${pathname}${query ? `?${query}` : ""}` as Route, {
      scroll: false,
    });
  };
  const definition = sections.find((section) => section.id === current);

  return (
    <div className="space-y-4" key={data.userId}>
      <div className="space-y-1">
        <p className="text-muted-foreground text-sm">{context.roleLabel}</p>
        <h2 className="text-lg font-semibold">{context.title}</h2>
        <p className="text-muted-foreground text-sm">{context.description}</p>
      </div>

      {context.readOnly ? (
        <Alert>
          <Eye aria-hidden="true" />
          <AlertTitle>View-only oversight</AlertTitle>
          <AlertDescription>
            Marketing oversees Promotion. You can see Promotion&apos;s work and
            review the reports sent to you, but changes stay with the
            Promotional Manager.
          </AlertDescription>
        </Alert>
      ) : null}

      <nav aria-label="Promotion workspace sections">
        <ul className="flex flex-wrap gap-1 rounded-lg border p-1">
          {sections.map(({ id, label }) => {
            const Icon = SECTION_ICONS[id];
            return (
              <li key={id}>
                <Button
                  type="button"
                  aria-current={current === id ? "page" : undefined}
                  variant={current === id ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => select(id)}
                >
                  <Icon aria-hidden="true" />
                  {label}
                </Button>
              </li>
            );
          })}
        </ul>
      </nav>

      <section aria-label={definition?.label ?? "Overview"}>
        {current === "overview" ? (
          <PromotionOverview
            sections={sections.filter((section) => section.id !== "overview")}
            onNavigate={select}
          />
        ) : definition?.comingInPhase ? (
          <ComingLater definition={definition} />
        ) : current === "campaigns" ? (
          <CampaignsScreen
            initialType="PROMOTION"
            readOnly={context.readOnly}
          />
        ) : current === "tasks" ? (
          <TasksScreen readOnly={context.readOnly} />
        ) : current === "partnerships" ? (
          <PartnersScreen readOnly={context.readOnly} />
        ) : current === "reports" ? (
          <ReportsScreen readOnly={context.readOnly} />
        ) : null}
      </section>
    </div>
  );
}

function PromotionOverview({
  sections,
  onNavigate,
}: {
  sections: readonly PromotionSectionDefinition[];
  onNavigate: (section: PromotionSection) => void;
}) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {sections.map((section) => {
        const Icon = SECTION_ICONS[section.id];
        return (
          <li key={section.id}>
            <button
              type="button"
              className="border-border hover:bg-muted/50 focus-visible:ring-ring/50 h-full w-full rounded-xl border p-4 text-left focus-visible:ring-3 focus-visible:outline-none"
              onClick={() => onNavigate(section.id)}
            >
              <Icon aria-hidden="true" className="text-muted-foreground" />
              <span className="mt-2 flex flex-wrap items-center gap-2 text-sm font-medium">
                {section.label}
                {section.comingInPhase ? (
                  <span className="text-muted-foreground text-xs font-normal">
                    Coming later
                  </span>
                ) : null}
              </span>
              <span className="text-muted-foreground mt-1 block text-sm">
                {SECTION_SUMMARIES[section.id]}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function ComingLater({
  definition,
}: {
  definition: PromotionSectionDefinition;
}) {
  const Icon = SECTION_ICONS[definition.id];
  return (
    <div
      role="status"
      className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center"
    >
      <Icon aria-hidden="true" className="text-muted-foreground size-6" />
      <p className="font-medium">
        {definition.label} is coming in a later phase
      </p>
      <p className="text-muted-foreground max-w-md text-sm">
        {SECTION_SUMMARIES[definition.id]} This section is not built yet, so
        nothing is shown here.
      </p>
    </div>
  );
}
