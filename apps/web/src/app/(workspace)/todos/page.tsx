import type { Metadata } from "next";
import Link from "next/link";
import { TodoScreen } from "@/features/todo";
export const metadata: Metadata = { title: "To-Do" };
export default function TodoPage() {
  return (
    <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
      <Link href="/" className="text-sm underline underline-offset-4">
        Back to home
      </Link>
      <h1 className="mt-4 text-xl font-semibold tracking-tight">To-Do</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Your personal planning items and reminders, separate from official
        tasks.
      </p>
      <div className="mt-6">
        <TodoScreen />
      </div>
    </main>
  );
}
