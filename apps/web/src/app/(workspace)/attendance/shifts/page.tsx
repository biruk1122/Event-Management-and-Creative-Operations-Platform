import type { Metadata } from "next";
import { AttendanceNavigation, ShiftScheduleScreen } from "@/features/attendance";
import { WorkSurface } from "@/components/ui/work-surface";
export const metadata: Metadata = { title: "Shift Scheduling" };
export default function AttendanceShiftsPage() {
  return (
    <main className="@container mx-auto max-w-352 px-5 py-5 sm:px-8">
      <WorkSurface
        title="Shift scheduling"
        description="Create and adjust event shifts, and assign employees to them."
      >
        <div className="space-y-4">
          <AttendanceNavigation />
          <ShiftScheduleScreen />
        </div>
      </WorkSurface>
    </main>
  );
}
