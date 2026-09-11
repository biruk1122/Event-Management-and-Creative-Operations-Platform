import { Injectable } from "@nestjs/common";
import yauzl from "yauzl";

/* yauzl's callback declarations expose entries as `any`; values are bounded
 * and checked before use below. */
/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */

export const SUPPORTED_MEDIA_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
] as const;

export type SupportedMediaType = (typeof SUPPORTED_MEDIA_TYPES)[number];

export interface VerifiedFile {
  mediaType: SupportedMediaType;
  sizeBytes: number;
}

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 1_000;
const MAX_ZIP_UNCOMPRESSED_BYTES = 100 * 1024 * 1024;
const PDF = Buffer.from("%PDF-");
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function startsWith(bytes: Uint8Array, prefix: Uint8Array): boolean {
  return (
    bytes.byteLength >= prefix.byteLength &&
    prefix.every((value, index) => bytes[index] === value)
  );
}

function isJpeg(bytes: Uint8Array): boolean {
  return (
    bytes.byteLength >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  );
}

function isWebp(bytes: Uint8Array): boolean {
  return (
    bytes.byteLength >= 12 &&
    Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "RIFF" &&
    Buffer.from(bytes.subarray(8, 12)).toString("ascii") === "WEBP"
  );
}

function isText(bytes: Uint8Array): boolean {
  if (bytes.includes(0)) return false;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    // Text uploads are not an escape hatch for executable browser content.
    // The allow-list deliberately excludes HTML, SVG, JavaScript, and XML.
    return !/(?:<!doctype\s+html|<\/?(?:html|head|body|script|svg)\b|<\?xml|javascript:)/i.test(
      text,
    );
  } catch {
    return false;
  }
}

interface ZipInspection {
  mediaType: SupportedMediaType | null;
  valid: boolean;
}

async function inspectOoxml(bytes: Uint8Array): Promise<ZipInspection> {
  return new Promise((resolve) => {
    yauzl.fromBuffer(
      Buffer.from(bytes),
      { lazyEntries: true },
      (error, zip) => {
        if (error || !zip) {
          resolve({ mediaType: null, valid: false });
          return;
        }

        let entries = 0;
        let uncompressedBytes = 0;
        let mediaType: SupportedMediaType | null = null;
        let hasContentTypes = false;
        let hasRootRelationships = false;
        let settled = false;
        const finish = (valid: boolean) => {
          if (!settled) {
            settled = true;
            zip.close();
            resolve({ mediaType, valid });
          }
        };

        zip.on("error", () => finish(false));
        zip.on("entry", (entry) => {
          entries += 1;
          uncompressedBytes += entry.uncompressedSize;
          if (
            entries > MAX_ZIP_ENTRIES ||
            uncompressedBytes > MAX_ZIP_UNCOMPRESSED_BYTES ||
            (entry.generalPurposeBitFlag & 0x1) !== 0
          ) {
            finish(false);
            return;
          }
          if (entry.fileName === "word/document.xml") {
            mediaType =
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
          } else if (entry.fileName === "xl/workbook.xml") {
            mediaType =
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
          } else if (entry.fileName === "ppt/presentation.xml") {
            mediaType =
              "application/vnd.openxmlformats-officedocument.presentationml.presentation";
          }
          if (entry.fileName === "[Content_Types].xml") hasContentTypes = true;
          if (entry.fileName === "_rels/.rels") hasRootRelationships = true;
          if (entry.fileName.toLowerCase().endsWith("vbaproject.bin")) {
            finish(false);
            return;
          }
          zip.readEntry();
        });
        zip.on("end", () =>
          finish(mediaType !== null && hasContentTypes && hasRootRelationships),
        );
        zip.readEntry();
      },
    );
  });
}

/**
 * Applies the allow-list after upload. File extensions and the browser-supplied
 * type are only an intent: bytes decide the verified type. ZIP is accepted
 * solely as bounded, unencrypted OOXML; archives and macro Office formats do
 * not pass this boundary.
 */
@Injectable()
export class FileVerificationService {
  async verify(
    declaredMediaType: string,
    bytes: Uint8Array,
  ): Promise<VerifiedFile | null> {
    if (bytes.byteLength < 1 || bytes.byteLength > MAX_FILE_BYTES) {
      return null;
    }

    let mediaType: SupportedMediaType | null = null;
    if (startsWith(bytes, PDF)) mediaType = "application/pdf";
    else if (isJpeg(bytes)) mediaType = "image/jpeg";
    else if (startsWith(bytes, PNG)) mediaType = "image/png";
    else if (isWebp(bytes)) mediaType = "image/webp";
    else if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
      const inspected = await inspectOoxml(bytes);
      if (!inspected.valid) return null;
      mediaType = inspected.mediaType;
    } else if (
      declaredMediaType === "text/plain" ||
      declaredMediaType === "text/csv"
    ) {
      mediaType = isText(bytes) ? declaredMediaType : null;
    }

    if (mediaType !== declaredMediaType) return null;
    return { mediaType, sizeBytes: bytes.byteLength };
  }
}
