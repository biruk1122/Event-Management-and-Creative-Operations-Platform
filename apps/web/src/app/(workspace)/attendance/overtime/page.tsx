import type { Metadata } from "next";
import {
  AttendanceNavigation,
  OvertimeReviewScreen,
} from "@/features/attendance";
import { WorkSurface } from "@/components/ui/work-surface";
export const metadata: Metadata = { title: "Overtime Review" };
export default function AttendanceOvertimePage() {
  return (
    <main className="@container mx-auto max-w-352 px-5 py-5 sm:px-8">
      <WorkSurface
        title="Overtime review"
        description="Approve or reject potential overtime recorded during checked-out shifts."
      >
        <div className="space-y-4">
          <AttendanceNavigation />
          <OvertimeReviewScreen />
        </div>
      </WorkSurface>
    </main>
  );
}
