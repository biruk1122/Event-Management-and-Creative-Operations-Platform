import type { Metadata } from "next";

import { KioskScreen } from "@/features/kiosk/components/kiosk-screen";

export const metadata: Metadata = {
  title: { absolute: "Attendance kiosk | Lela Creative Management" },
};

/**
 * A shared office device's own attendance screen - deliberately outside the
 * `(workspace)` route group, so it renders with no sidebar/header shell and
 * no cookie-based employee session. The device authenticates itself with
 * its own bearer secret (see `features/kiosk`), never a logged-in user.
 */
export default function KioskPage() {
  return <KioskScreen />;
}
