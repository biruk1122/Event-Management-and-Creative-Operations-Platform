import type {
  ArchiveHook,
  ArchivingWork,
} from "../../src/common/archive/archive-hook.js";

/** Records every archive a repository reports, so a test can check what was cancelled. */
export function recordArchives(): {
  hook: ArchiveHook;
  archives: ArchivingWork[];
} {
  const archives: ArchivingWork[] = [];
  const hook: ArchiveHook = (_tx, archiving) => {
    archives.push(archiving);
    return Promise.resolve();
  };
  return { hook, archives };
}
