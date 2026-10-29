import type { Metadata } from "next";
import { AttendanceNavigation, AttendanceScreen } from "@/features/attendance";
import { WorkSurface } from "@/components/ui/work-surface";
export const metadata: Metadata = { title: "Attendance" };
export default function AttendancePage() {
  return (
    <main className="@container mx-auto max-w-352 px-5 py-5 sm:px-8">
      <WorkSurface
        title="Attendance"
        description="Check in and out, and review your recent sessions."
      >
        <div className="space-y-4">
          <AttendanceNavigation />
          <AttendanceScreen />
        </div>
      </WorkSurface>
    </main>
  );
}
