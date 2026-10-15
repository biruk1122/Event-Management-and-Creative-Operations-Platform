import type { Metadata } from "next";
import Link from "next/link";
import { WorkSurface } from "@/components/ui/work-surface";
import { NotificationsScreen } from "@/features/notifications";
export const metadata: Metadata = { title: "Notifications" };
export default function NotificationsPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8">
      <Link href="/" className="text-sm underline underline-offset-4">
        Back to home
      </Link>
      <WorkSurface
        title="Notifications"
        description="Review your updates and control reminder preferences."
      >
        <NotificationsScreen />
      </WorkSurface>
    </main>
  );
}
