import type { Metadata } from "next";
import { NotificationsScreen } from "@/features/notifications";
import styles from "@/features/notifications/components/notifications-center.module.css";
export const metadata: Metadata = { title: "Notifications" };
export default function NotificationsPage() {
  return (
    <main className={styles.page}>
      <NotificationsScreen />
    </main>
  );
}
