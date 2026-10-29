import type { Metadata } from "next";
import { TodoScreen } from "@/features/todo";
import { WorkSurface } from "@/components/ui/work-surface";
export const metadata: Metadata = { title: "To-Do" };
export default function TodoPage() {
  return (
    <main className="@container mx-auto max-w-352 px-5 py-5 sm:px-8">
      <WorkSurface>
        <TodoScreen />
      </WorkSurface>
    </main>
  );
}
