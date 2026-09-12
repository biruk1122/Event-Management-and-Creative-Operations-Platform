import type { EventFile } from "../lib/file-types";
const files = new Map<string, EventFile[]>();
export async function listFixtureFiles(eventId: string) {
  return [...(files.get(eventId) ?? [])];
}
export async function uploadFixtureFile(
  eventId: string,
  file: File,
): Promise<EventFile> {
  const item: EventFile = {
    id: crypto.randomUUID(),
    filename: file.name,
    mediaType: file.type as EventFile["mediaType"],
    sizeBytes: file.size,
    state: "available",
    createdAt: new Date().toISOString(),
  };
  files.set(eventId, [...(files.get(eventId) ?? []), item]);
  return item;
}
export async function removeFixtureFile(eventId: string, fileId: string) {
  files.set(
    eventId,
    (files.get(eventId) ?? []).filter((file) => file.id !== fileId),
  );
}
export async function downloadFixtureFile() {
  return Promise.resolve();
}
