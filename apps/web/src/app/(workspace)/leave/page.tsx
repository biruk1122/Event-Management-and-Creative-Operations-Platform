import type { Metadata } from "next";
import { LeaveNavigation, LeaveScreen } from "@/features/leave";
import { WorkSurface } from "@/components/ui/work-surface";
export const metadata: Metadata = { title: "Leave" };
export default function LeavePage() {
  return (
    <main className="@container mx-auto max-w-352 px-5 py-5 sm:px-8">
      <WorkSurface
        title="Leave"
        description="View your leave balance, submit a request, and track your requests."
      >
        <div className="space-y-4">
          <LeaveNavigation />
          <LeaveScreen />
        </div>
      </WorkSurface>
    </main>
  );
}
