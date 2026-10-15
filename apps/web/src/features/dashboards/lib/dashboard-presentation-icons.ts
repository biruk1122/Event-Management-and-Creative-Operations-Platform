import {
  AlarmClock,
  AlertCircle,
  AlertOctagon,
  AlertTriangle,
  BarChart3,
  Calendar,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Clock,
  FolderKanban,
  Hash,
  History,
  ListChecks,
  ListTodo,
  Megaphone,
  MessageSquare,
  ReceiptText,
  Sparkles,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { IconTone } from "../components/dashboard-icon-badge";

/** Per-card icon + tone, keyed by `DashboardCard` key (see
 * `dashboard-presentation.ts`). Tone encodes data semantics only
 * (completed -> success, needs action -> warning, forward-looking ->
 * information, neutral -> primary) - identical regardless of viewer role,
 * matching the design system's "work-area accents must not become
 * unrelated role themes or encode authorization through color" rule. */
export const cardIcons: Record<string, { icon: LucideIcon; tone: IconTone }> = {
  // Management - Overview
  totalEvents: { icon: Calendar, tone: "primary" },
  upcomingEvents: { icon: CalendarClock, tone: "information" },
  completedEvents: { icon: CalendarCheck, tone: "success" },
  pendingExpenseApprovals: { icon: ReceiptText, tone: "warning" },
  budgetPlannedVsApproved: { icon: Wallet, tone: "primary" },
  activeProjects: { icon: FolderKanban, tone: "primary" },
  activeCampaigns: { icon: Megaphone, tone: "primary" },
  pendingTasks: { icon: ListTodo, tone: "warning" },
  completedTasks: { icon: CheckCircle2, tone: "success" },
  overdueTasks: { icon: AlertTriangle, tone: "warning" },
  activeEmployees: { icon: Users, tone: "primary" },
  activeTalents: { icon: Sparkles, tone: "primary" },
  // Management - Today
  todayEvents: { icon: CalendarDays, tone: "information" },
  todayMeetings: { icon: Clock, tone: "information" },
  todayDeadlines: { icon: AlarmClock, tone: "warning" },
  attentionTasks: { icon: AlertCircle, tone: "warning" },
  overdueActivities: { icon: AlertTriangle, tone: "warning" },
  operationalIssues: { icon: AlertOctagon, tone: "warning" },
  // Management - Communication
  unreadMessages: { icon: MessageSquare, tone: "information" },
  activeChannels: { icon: Hash, tone: "information" },
  upcomingMeetings: { icon: CalendarClock, tone: "information" },
  // Management - Analytics
  eventProgress: { icon: BarChart3, tone: "primary" },
  marketingProgress: { icon: BarChart3, tone: "primary" },
  promotionPerformance: { icon: BarChart3, tone: "primary" },
  // Employee - "My work"
  myTasks: { icon: ListTodo, tone: "warning" },
  myTodo: { icon: ListChecks, tone: "primary" },
  todaySchedule: { icon: CalendarDays, tone: "information" },
  myUpcomingMeetings: { icon: CalendarClock, tone: "information" },
  myUpcomingDeadlines: { icon: AlarmClock, tone: "warning" },
  myUnreadMessages: { icon: MessageSquare, tone: "information" },
  recentActivity: { icon: History, tone: "primary" },
};
