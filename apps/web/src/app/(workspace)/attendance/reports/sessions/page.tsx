import type { Metadata } from "next";
import {
  AttendanceNavigation,
  AttendanceSessionsScreen,
} from "@/features/attendance";
import { WorkSurface } from "@/components/ui/work-surface";
export const metadata: Metadata = { title: "Detailed Attendance Sessions" };
export default function AttendanceSessionsPage() {
  return (
    <main className="@container mx-auto max-w-352 px-5 py-5 sm:px-8">
      <WorkSurface
        title="Detailed attendance sessions"
        description="Every check-in and check-out, grouped by month."
      >
        <div className="space-y-4">
          <AttendanceNavigation />
          <AttendanceSessionsScreen />
        </div>
      </WorkSurface>
    </main>
  );
}
