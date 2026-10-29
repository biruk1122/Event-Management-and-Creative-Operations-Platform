import type { Metadata } from "next";
import { AttendanceNavigation, ExceptionReviewScreen } from "@/features/attendance";
import { WorkSurface } from "@/components/ui/work-surface";
export const metadata: Metadata = { title: "Exception Review" };
export default function AttendanceExceptionsPage() {
  return (
    <main className="@container mx-auto max-w-352 px-5 py-5 sm:px-8">
      <WorkSurface
        title="Exception review"
        description="Decide missed-checkout and location exceptions raised against attendance sessions."
      >
        <div className="space-y-4">
          <AttendanceNavigation />
          <ExceptionReviewScreen />
        </div>
      </WorkSurface>
    </main>
  );
}
