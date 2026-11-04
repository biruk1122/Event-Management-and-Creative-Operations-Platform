import type { Prisma } from "../../generated/prisma/client.js";

/** A work item kind that talent can be assigned to. */
export type ArchivableWorkKind = "EVENT" | "PRODUCTION" | "PROMOTION";

/** One work item being archived, with its name at the time of archiving. */
export interface ArchivedWork {
  kind: ArchivableWorkKind;
  workId: string;
  workName: string;
}

/** The parent being archived and every work item archived with it. */
export interface ArchivingWork {
  /** The name a person would recognise, for example the event's name. */
  label: string;
  /** The responsible manager of the parent's workspace, or null when there is none. */
  workspaceManagerId: string | null;
  works: ArchivedWork[];
}

/**
 * Runs inside the archiving transaction. Owning modules call it only when the
 * work item has talent assignment history, so the archive and the cancellation
 * of its active assignments commit or roll back together.
 */
export type ArchiveHook = (
  tx: Prisma.TransactionClient,
  archiving: ArchivingWork,
) => Promise<void>;
