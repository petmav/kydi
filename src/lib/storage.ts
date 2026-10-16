import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/env";
import { randomToken } from "@/lib/auth/tokens";

/** Volume-backed file storage rooted at UPLOAD_DIR (/data/uploads in the container). */

function root(): string {
  return path.resolve(env.uploadDir);
}

function resolveSafe(relative: string): string {
  const full = path.resolve(root(), relative);
  if (!full.startsWith(root() + path.sep)) throw new Error("Invalid storage path");
  return full;
}

export const RECEIPT_EXTENSIONS = ["jpg", "jpeg", "png", "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx"];
export const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp", "svg"];

export function extensionOf(name: string): string {
  return path.extname(name).slice(1).toLowerCase();
}

/** Stores a file and returns its storage-relative path. */
export async function storeFile(folder: string, originalName: string, data: Buffer): Promise<string> {
  const ext = extensionOf(originalName) || "bin";
  const relative = path.posix.join(folder, `${Date.now()}-${randomToken(8)}.${ext}`);
  const full = resolveSafe(relative);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, data);
  return relative;
}

export async function readStoredFile(relative: string): Promise<Buffer | null> {
  try {
    return await readFile(resolveSafe(relative));
  } catch {
    return null;
  }
}

export async function deleteStoredFile(relative: string | null | undefined): Promise<void> {
  if (!relative) return;
  try {
    await rm(resolveSafe(relative), { force: true });
  } catch {
    // ignore missing files
  }
}

const MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

export function mimeFor(name: string): string {
  return MIME[extensionOf(name)] ?? "application/octet-stream";
}
