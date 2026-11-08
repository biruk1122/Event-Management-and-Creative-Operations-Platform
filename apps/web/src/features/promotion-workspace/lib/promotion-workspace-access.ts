import type { CurrentAccess } from "@/features/auth/api/access-queries";
import { oversees } from "@/features/auth/lib/department-oversight";
import { canReadCampaigns } from "@/features/campaigns/lib/campaign-access";
import { canReadPartners } from "@/features/partners/lib/partner-access";
import { reportAbilities } from "@/features/reports/lib/reports-access";
import { canReadTasks } from "@/features/tasks/lib/task-access";

export const PROMOTION_DEPARTMENT = "Promotion";

/**
 * The Promotional Manager workspace (EVE-229). There is no Promotional Manager
 * role: it is the Department Manager of the Promotion department, the same way
 * the Marketing Manager is the Department Manager of Marketing.
 *
 * Entry, mirroring what the API lets each person read:
 * - Super Admin: organization-wide oversight;
 * - anyone whose own active department is Promotion;
 * - the manager of the department that oversees Promotion (the Marketing
 *   Manager), read-only.
 * Everyone else, Admin included, is denied. This only shapes navigation; the
 * API enforces every read and write.
 */
export function canEnterPromotionWorkspace(access: CurrentAccess): boolean {
  if (access.role === "SUPER_ADMIN") return true;
  if (isPromotionMember(access)) return true;
  return isPromotionOverseer(access);
}

function isPromotionMember(access: CurrentAccess): boolean {
  return (
    access.department?.active === true &&
    access.department.name === PROMOTION_DEPARTMENT
  );
}

/** The overseeing manager (today the Marketing Manager), read-only here. */
export function isPromotionOverseer(access: CurrentAccess): boolean {
  return (
    access.role === "DEPARTMENT_MANAGER" &&
    !isPromotionMember(access) &&
    oversees(access, PROMOTION_DEPARTMENT)
  );
}

export interface PromotionWorkspaceContext {
  title: string;
  roleLabel: string;
  description: string;
  /** True when the viewer can look but never change anything. */
  readOnly: boolean;
}

export function promotionWorkspaceContext(
  access: CurrentAccess,
): PromotionWorkspaceContext | null {
  if (access.role === "SUPER_ADMIN") {
    return {
      title: "Promotion — oversight",
      roleLabel: "Super Admin",
      description:
        "Oversee promotional campaigns, the Promotion team's work and the reports it submits.",
      readOnly: false,
    };
  }
  if (isPromotionOverseer(access)) {
    return {
      title: "Promotion — Marketing oversight",
      roleLabel: "Marketing Manager · read-only",
      description:
        "Follow Promotion's campaigns, activities, tasks, partnerships and reports. You can review the reports the Promotional Manager sends you; everything else is view-only.",
      readOnly: true,
    };
  }
  if (!isPromotionMember(access)) return null;
  switch (access.role) {
    case "DEPARTMENT_MANAGER":
      return {
        title: "Promotion Department workspace",
        roleLabel: "Promotional Manager",
        description:
          "Run promotional campaigns and activities, assign and review your team's tasks, manage partnerships, and report to the Marketing Manager.",
        readOnly: false,
      };
    case "DEPARTMENT_MEMBER":
      return {
        title: "My Promotion work",
        roleLabel: "Promotion Team Member",
        description:
          "Your assigned promotional tasks and activities. Submit your work for review and track your progress reports.",
        readOnly: false,
      };
    default:
      return null;
  }
}

export const PROMOTION_SECTIONS = [
  "overview",
  "campaigns",
  "activities",
  "tasks",
  "partnerships",
  "creative-requests",
  "event-promotions",
  "budget",
  "reports",
  "calendar",
] as const;

export type PromotionSection = (typeof PROMOTION_SECTIONS)[number];

export interface PromotionSectionDefinition {
  id: PromotionSection;
  label: string;
  /** Built in a later phase; shows a clear "coming later" state, never data. */
  comingInPhase: number | null;
}

const SECTION_DEFINITIONS: readonly PromotionSectionDefinition[] = [
  { id: "overview", label: "Overview", comingInPhase: null },
  { id: "campaigns", label: "Campaigns", comingInPhase: null },
  { id: "activities", label: "Promotional Activities", comingInPhase: null },
  { id: "tasks", label: "Team Tasks", comingInPhase: null },
  { id: "partnerships", label: "Partnerships", comingInPhase: null },
  { id: "creative-requests", label: "Creative Requests", comingInPhase: 3 },
  { id: "event-promotions", label: "Event Promotions", comingInPhase: 5 },
  { id: "budget", label: "Budget", comingInPhase: 4 },
  { id: "reports", label: "Reports", comingInPhase: null },
  { id: "calendar", label: "Calendar", comingInPhase: null },
];

function holds(access: CurrentAccess, key: string): boolean {
  return access.grants.some(
    (grant) =>
      grant.permissionKey === key &&
      (grant.scope === "ORGANIZATION" ||
        grant.scope === "DEPARTMENT" ||
        grant.scope === "SELF"),
  );
}

/**
 * The sections this viewer may open, each gated by the read permission of the
 * module behind it. Overview is always present for anyone who can enter.
 */
export function promotionSections(
  access: CurrentAccess,
): PromotionSectionDefinition[] {
  const campaigns = canReadCampaigns(access);
  const allowed: Record<PromotionSection, boolean> = {
    overview: true,
    campaigns,
    activities: campaigns,
    tasks: canReadTasks(access),
    partnerships: canReadPartners(access),
    "creative-requests": canReadTasks(access),
    "event-promotions": campaigns,
    budget:
      holds(access, "campaign.budget.read") || holds(access, "expense.read"),
    reports: reportAbilities(access).canRead,
    calendar: canReadTasks(access) || campaigns,
  };
  return SECTION_DEFINITIONS.filter((section) => allowed[section.id]);
}

/** The section named in the URL, if this viewer may open it; else Overview. */
export function resolvePromotionSection(
  access: CurrentAccess,
  requested: string | null,
): PromotionSection {
  const sections = promotionSections(access);
  return sections.find((section) => section.id === requested)?.id ?? "overview";
}
