import type { Metadata } from "next";
import { LeaveGrantsScreen, LeaveNavigation } from "@/features/leave";
import { WorkSurface } from "@/components/ui/work-surface";
export const metadata: Metadata = { title: "Leave Grants" };
export default function LeaveGrantsPage() {
  return (
    <main className="@container mx-auto max-w-352 px-5 py-5 sm:px-8">
      <WorkSurface
        title="Leave grants"
        description="Manually grant leave balance to an employee. Each grant expires two years from its own grant date."
      >
        <div className="space-y-4">
          <LeaveNavigation />
          <LeaveGrantsScreen />
        </div>
      </WorkSurface>
    </main>
  );
}
