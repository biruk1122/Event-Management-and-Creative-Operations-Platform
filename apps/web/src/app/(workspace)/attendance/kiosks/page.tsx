import type { Metadata } from "next";
import { AttendanceNavigation, KioskManagementScreen } from "@/features/attendance";
import { WorkSurface } from "@/components/ui/work-surface";
export const metadata: Metadata = { title: "Kiosk Management" };
export default function AttendanceKiosksPage() {
  return (
    <main className="@container mx-auto max-w-352 px-5 py-5 sm:px-8">
      <WorkSurface
        title="Kiosk management"
        description="Register and revoke shared office tablets used for attendance punching."
      >
        <div className="space-y-4">
          <AttendanceNavigation />
          <KioskManagementScreen />
        </div>
      </WorkSurface>
    </main>
  );
}
