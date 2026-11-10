import type { Metadata } from "next";
import { CalendarScreen } from "@/features/calendar";

export const metadata: Metadata = { title: "Calendar" };

export default function CalendarPage() {
  return (
    <main className="@container mx-auto max-w-352 px-5 py-8 sm:px-8">
      <CalendarScreen />
    </main>
  );
}
