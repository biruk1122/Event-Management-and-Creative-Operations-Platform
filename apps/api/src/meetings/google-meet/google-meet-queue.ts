import type { Prisma } from "../../generated/prisma/client.js";

/** Persist optional export intent inside the local meeting transaction.
 * There is no provider dependency or network I/O in this core write path. */
export async function queueGoogleMeetChange(
  tx: Prisma.TransactionClient,
  meeting: {
    id: string;
    status: string;
    type: string;
    onlineLink: string | null;
  },
) {
  const mapping = await tx.googleMeetExport.findUnique({
    where: { meetingId: meeting.id },
  });
  if (!mapping || mapping.status === "DETACHED") return;
  if (meeting.status === "COMPLETED") {
    await tx.googleMeetExport.update({
      where: { meetingId: meeting.id },
      data: { nextAttemptAt: null },
    });
    return;
  }
  const cleanup =
    meeting.status === "CANCELLED" ||
    meeting.type === "PHYSICAL" ||
    (mapping.publishedLink ?? mapping.fallbackLink) !== meeting.onlineLink;
  await tx.googleMeetExport.update({
    where: { meetingId: meeting.id },
    data: {
      status: cleanup ? "CLEANUP_PENDING" : "PENDING",
      attempts: 0,
      nextAttemptAt: new Date(),
      failure: null,
    },
  });
}
