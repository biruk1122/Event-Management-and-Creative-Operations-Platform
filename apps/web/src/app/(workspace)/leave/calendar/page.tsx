import type { Metadata } from "next";
import { LeaveCalendarScreen, LeaveNavigation } from "@/features/leave";
import { WorkSurface } from "@/components/ui/work-surface";
export const metadata: Metadata = { title: "Leave Calendar" };
export default function LeaveCalendarPage() {
  return (
    <main className="@container mx-auto max-w-352 px-5 py-5 sm:px-8">
      <WorkSurface
        title="Leave calendar"
        description="Approved leave within a date range, scoped to what you can see."
      >
        <div className="space-y-4">
          <LeaveNavigation />
          <LeaveCalendarScreen />
        </div>
      </WorkSurface>
    </main>
  );
}
