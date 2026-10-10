import type { Metadata } from "next";
import Link from "next/link";
import { CalendarScreen } from "@/features/calendar";
export const metadata: Metadata = { title: "Calendar" };
export default function CalendarPage() {
  return (
    <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
      <Link href="/" className="text-sm underline underline-offset-4">
        Back to home
      </Link>
      <h1 className="mt-4 text-xl font-semibold tracking-tight">Calendar</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Your events, tasks, project deadlines, and personal entries in one
        place.
      </p>
      <div className="mt-6">
        <CalendarScreen />
      </div>
    </main>
  );
}
