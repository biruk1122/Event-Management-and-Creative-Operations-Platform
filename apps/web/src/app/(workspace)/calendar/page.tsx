import type { Metadata } from "next";
import Link from "next/link";
import { CalendarScreen } from "@/features/calendar";
import { WorkSurface } from "@/components/ui/work-surface";
export const metadata: Metadata = { title: "Calendar" };
export default function CalendarPage() {
  return (
    <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
      <Link href="/" className="text-sm underline underline-offset-4">
        Back to home
      </Link>
      <WorkSurface
        title="Calendar"
        description="Your events, tasks, project deadlines, and personal entries in one place."
      >
        <CalendarScreen />
      </WorkSurface>
    </main>
  );
}
