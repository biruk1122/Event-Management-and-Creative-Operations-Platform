import { Injectable } from "@nestjs/common";

export const FILE_SCANNER = Symbol("FILE_SCANNER");

export type ScanResult = "clean" | "infected" | "unavailable";

export interface FileScanner {
  scan(input: { bytes: Uint8Array; mediaType: string }): Promise<ScanResult>;
}

/** Explicitly development/test-only scanner; it must never become a production fallback. */
@Injectable()
export class DevelopmentTestFileScanner implements FileScanner {
  scan(): Promise<ScanResult> {
    return Promise.resolve("clean");
  }
}

@Injectable()
export class UnavailableFileScanner implements FileScanner {
  scan(): Promise<ScanResult> {
    return Promise.resolve("unavailable");
  }
}
