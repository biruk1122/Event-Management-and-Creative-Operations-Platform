import type { Metadata } from "next";
import { CalendarScreen } from "@/features/calendar";
import { WorkSurface } from "@/components/ui/work-surface";
export const metadata: Metadata = { title: "Calendar" };
export default function CalendarPage() {
  return (
    <main className="@container mx-auto max-w-352 px-5 py-5 sm:px-8">
      <WorkSurface>
        <CalendarScreen />
      </WorkSurface>
    </main>
  );
}
