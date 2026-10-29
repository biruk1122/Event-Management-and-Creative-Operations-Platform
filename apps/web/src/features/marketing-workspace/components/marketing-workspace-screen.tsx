"use client";

import Link from "next/link";
import { useState } from "react";
import {
  CheckSquare,
  FileText,
  Handshake,
  LayoutGrid,
  Megaphone,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { useCurrentAccess } from "@/features/auth/api/access-queries";
import { CampaignsScreen } from "@/features/campaigns/components/campaigns-screen";
import { canReadCampaigns } from "@/features/campaigns/lib/campaign-access";
import { PartnersScreen } from "@/features/partners/components/partners-screen";
import { canReadPartners } from "@/features/partners/lib/partner-access";
import { ReportsScreen } from "@/features/reports/components/reports-screen";
import { reportAbilities } from "@/features/reports/lib/reports-access";
import { TasksScreen } from "@/features/tasks/components/tasks-screen";
import { canReadTasks } from "@/features/tasks/lib/task-access";

import {
  canEnterMarketingWorkspace,
  marketingWorkspaceContext,
} from "../lib/marketing-workspace-access";

const LOGIN_HREF = "/login?next=%2Fmarketing";

type Tab = "overview" | "tasks" | "campaigns" | "partners" | "reports";

export function MarketingWorkspaceScreen() {
  const access = useCurrentAccess();
  const [tab, setTab] = useState<Tab>("overview");

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

  if (!canEnterMarketingWorkspace(data)) {
    return <p role="alert">You do not have access to this area.</p>;
  }

  const context = marketingWorkspaceContext(data);
  if (!context) {
    return (
      <p role="alert">
        Ask Super Admin to assign you to an active department before accessing
        department work.
      </p>
    );
  }

  const tabs: { id: Tab; label: string; icon: typeof LayoutGrid }[] = [
    { id: "overview", label: "Overview", icon: LayoutGrid },
    ...(canReadTasks(data)
      ? [{ id: "tasks" as const, label: "Tasks", icon: CheckSquare }]
      : []),
    ...(canReadCampaigns(data)
      ? [{ id: "campaigns" as const, label: "Campaigns", icon: Megaphone }]
      : []),
    ...(canReadPartners(data)
      ? [{ id: "partners" as const, label: "Partners", icon: Handshake }]
      : []),
    ...(reportAbilities(data).canRead
      ? [{ id: "reports" as const, label: "Reports", icon: FileText }]
      : []),
  ];

  return (
    <div className="space-y-4" key={data.userId}>
      <div className="space-y-1">
        <p className="text-muted-foreground text-sm">{context.roleLabel}</p>
        <h2 className="text-lg font-semibold">{context.title}</h2>
        <p className="text-muted-foreground text-sm">{context.description}</p>
      </div>

      <div
        role="group"
        aria-label="Marketing workspace section"
        className="flex flex-wrap gap-1 rounded-lg border p-1"
      >
        {tabs.map(({ id, label, icon: Icon }) => (
          <Button
            key={id}
            type="button"
            aria-pressed={tab === id}
            variant={tab === id ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setTab(id)}
          >
            <Icon aria-hidden="true" />
            {label}
          </Button>
        ))}
      </div>

      {tab === "overview" ? (
        <MarketingOverview
          roleLabel={context.roleLabel}
          canReadTasks={canReadTasks(data)}
          canReadCampaigns={canReadCampaigns(data)}
          canReadPartners={canReadPartners(data)}
          canReadReports={reportAbilities(data).canRead}
          onNavigate={setTab}
        />
      ) : null}
      {tab === "tasks" ? <TasksScreen /> : null}
      {tab === "campaigns" ? <CampaignsScreen initialType="MARKETING" /> : null}
      {tab === "partners" ? <PartnersScreen /> : null}
      {tab === "reports" ? <ReportsScreen /> : null}
    </div>
  );
}

function MarketingOverview({
  roleLabel,
  canReadTasks,
  canReadCampaigns,
  canReadPartners,
  canReadReports,
  onNavigate,
}: {
  roleLabel: string;
  canReadTasks: boolean;
  canReadCampaigns: boolean;
  canReadPartners: boolean;
  canReadReports: boolean;
  onNavigate: (tab: Tab) => void;
}) {
  const cards: {
    tab: Tab;
    label: string;
    description: string;
    icon: typeof LayoutGrid;
    show: boolean;
  }[] = [
    {
      tab: "tasks",
      label: "Tasks",
      description:
        roleLabel === "Super Admin"
          ? "Assign strategic directives to the Marketing Manager."
          : roleLabel === "Marketing Manager"
            ? "Break directives into team tasks and review submissions."
            : "Your assigned tasks and deadlines.",
      icon: CheckSquare,
      show: canReadTasks,
    },
    {
      tab: "campaigns",
      label: "Campaigns",
      description: "Marketing campaigns, activities, and progress.",
      icon: Megaphone,
      show: canReadCampaigns,
    },
    {
      tab: "partners",
      label: "Partners",
      description: "Sponsors, media, and strategic-partner relationships.",
      icon: Handshake,
      show: canReadPartners,
    },
    {
      tab: "reports",
      label: "Reports",
      description:
        roleLabel === "Super Admin"
          ? "Review the Manager's consolidated execution reports."
          : roleLabel === "Marketing Manager"
            ? "Review team reports and submit the department report upward."
            : "Submit your progress reports to the Manager.",
      icon: FileText,
      show: canReadReports,
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {cards
        .filter((card) => card.show)
        .map((card) => (
          <button
            key={card.tab}
            type="button"
            className="border-border hover:bg-muted/50 focus-visible:ring-ring/50 rounded-xl border p-4 text-left focus-visible:ring-3 focus-visible:outline-none"
            onClick={() => onNavigate(card.tab)}
          >
            <card.icon aria-hidden="true" className="text-muted-foreground" />
            <p className="mt-2 text-sm font-medium">{card.label}</p>
            <p className="text-muted-foreground mt-1 text-sm">
              {card.description}
            </p>
          </button>
        ))}
    </div>
  );
}
