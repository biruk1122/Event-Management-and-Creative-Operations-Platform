import {
  Bell,
  CalendarDays,
  FolderKanban,
  SquareCheck,
  UserRound,
  UsersRound,
} from "lucide-react";
import type { CalendarEntryType } from "../lib/calendar-types";

const ENTRY_ICONS = {
  EVENT: CalendarDays,
  TASK: SquareCheck,
  MEETING: UsersRound,
  PROJECT: FolderKanban,
  PERSONAL: UserRound,
  REMINDER: Bell,
};

export function CalendarEntryIcon({ type }: { type: CalendarEntryType }) {
  const Icon = ENTRY_ICONS[type];
  return <Icon aria-hidden="true" />;
}
