import type { Metadata } from "next";
import Link from "next/link";
import { NotificationsScreen } from "@/features/notifications";
export const metadata: Metadata = { title: "Notifications" };
export default function NotificationsPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8">
      <Link href="/" className="text-sm underline underline-offset-4">
        Back to home
      </Link>
      <h1 className="mt-4 text-xl font-semibold tracking-tight">
        Notifications
      </h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Review your updates and control reminder preferences.
      </p>
      <div className="mt-6">
        <NotificationsScreen />
      </div>
    </main>
  );
}
