import type { Metadata } from "next";
import { AttendanceNavigation, AttendanceReportScreen } from "@/features/attendance";
import { WorkSurface } from "@/components/ui/work-surface";
export const metadata: Metadata = { title: "Attendance Reports" };
export default function AttendanceReportsPage() {
  return (
    <main className="@container mx-auto max-w-352 px-5 py-5 sm:px-8">
      <WorkSurface
        title="Attendance reports"
        description="Summarize attendance, lateness, and overtime across a date range."
      >
        <div className="space-y-4">
          <AttendanceNavigation />
          <AttendanceReportScreen />
        </div>
      </WorkSurface>
    </main>
  );
}
