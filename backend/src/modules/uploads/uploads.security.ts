import path from "node:path";
import { randomBytes } from "node:crypto";

export const ALLOWED_MIME_TYPES = new Map([
  ["application/pdf", ".pdf"],
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ".xlsx"],
  ["application/vnd.ms-excel", ".xls"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".docx"],
  ["application/msword", ".doc"],
]);

export function buildStoredFilename(mimeType: string): string | null {
  const extension = ALLOWED_MIME_TYPES.get(mimeType);
  return extension ? randomBytes(24).toString("hex") + extension : null;
}

export function isSafeStoredFilename(filename: string): boolean {
  return Boolean(filename) &&
    !filename.includes("\0") &&
    !filename.includes("..") &&
    path.basename(filename) === filename &&
    /^[a-f0-9]{48}\.(pdf|jpg|png|xlsx|xls|docx|doc)$/.test(filename);
}
