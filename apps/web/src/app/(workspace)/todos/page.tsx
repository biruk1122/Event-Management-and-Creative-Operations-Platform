import type { Metadata } from "next";
import Link from "next/link";
import { TodoScreen } from "@/features/todo";
import { WorkSurface } from "@/components/ui/work-surface";
export const metadata: Metadata = { title: "To-Do" };
export default function TodoPage() {
  return (
    <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
      <Link href="/" className="text-sm underline underline-offset-4">
        Back to home
      </Link>
      <WorkSurface
        title="To-Do"
        description="Your personal planning items and reminders, separate from official tasks."
      >
        <TodoScreen />
      </WorkSurface>
    </main>
  );
}
