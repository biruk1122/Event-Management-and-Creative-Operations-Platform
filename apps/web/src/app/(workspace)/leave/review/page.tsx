import type { Metadata } from "next";
import { LeaveNavigation, LeaveReviewScreen } from "@/features/leave";
import { WorkSurface } from "@/components/ui/work-surface";
export const metadata: Metadata = { title: "Leave Review" };
export default function LeaveReviewPage() {
  return (
    <main className="@container mx-auto max-w-352 px-5 py-5 sm:px-8">
      <WorkSurface
        title="Leave review"
        description="Approve, reject, or return leave requests for changes."
      >
        <div className="space-y-4">
          <LeaveNavigation />
          <LeaveReviewScreen />
        </div>
      </WorkSurface>
    </main>
  );
}
