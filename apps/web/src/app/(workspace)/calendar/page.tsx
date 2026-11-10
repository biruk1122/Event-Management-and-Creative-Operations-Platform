import type { Metadata } from "next";
import { CalendarScreen } from "@/features/calendar";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Calendar" };

export default function CalendarPage() {
  return (
    <main className="@container mx-auto max-w-352 px-5 py-8 sm:px-8">
      <PageHeader
        className="pb-6"
        title="Calendar"
        description="Your events, tasks, project deadlines, and personal entries in one place."
      />
      <CalendarScreen />
    </main>
  );
}
