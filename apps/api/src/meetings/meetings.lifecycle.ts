import { MeetingStatus } from "../generated/prisma/client.js";

export function canTransitionMeeting(
  current: MeetingStatus,
  target: MeetingStatus,
): boolean {
  return (
    current === MeetingStatus.SCHEDULED &&
    (target === MeetingStatus.COMPLETED || target === MeetingStatus.CANCELLED)
  );
}
