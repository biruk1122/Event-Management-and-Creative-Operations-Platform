import type { Metadata } from "next";
import { AttendanceNavigation, AttendanceCalendarScreen } from "@/features/attendance";
import { WorkSurface } from "@/components/ui/work-surface";
export const metadata: Metadata = { title: "Work Calendar" };
export default function AttendanceCalendarPage() {
  return (
    <main className="@container mx-auto max-w-352 px-5 py-5 sm:px-8">
      <WorkSurface
        title="Work calendar"
        description="The weekly schedule and holidays used for attendance reporting."
      >
        <div className="space-y-4">
          <AttendanceNavigation />
          <AttendanceCalendarScreen />
        </div>
      </WorkSurface>
    </main>
  );
}
