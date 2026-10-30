import type { Metadata } from "next";
import { LeaveNavigation, LeaveTypesScreen } from "@/features/leave";
import { WorkSurface } from "@/components/ui/work-surface";
export const metadata: Metadata = { title: "Leave Types" };
export default function LeaveTypesPage() {
  return (
    <main className="@container mx-auto max-w-352 px-5 py-5 sm:px-8">
      <WorkSurface
        title="Leave types"
        description="Configure the leave categories employees can request against."
      >
        <div className="space-y-4">
          <LeaveNavigation />
          <LeaveTypesScreen />
        </div>
      </WorkSurface>
    </main>
  );
}
