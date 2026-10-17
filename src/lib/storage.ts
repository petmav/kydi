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
/** Company logos: raster formats only (SVG can carry script and the logo route is public). */
export const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp"];

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

/** Raster image types accepted for profile photos (no SVG: avatars are shown to other users). */
export const AVATAR_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp"];

/** Checks the leading bytes so a renamed file cannot pass as an image. Returns the detected extension. */
export function sniffImage(data: Buffer): "png" | "jpg" | "gif" | "webp" | null {
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "jpg";
  if (data.length >= 6 && (data.subarray(0, 6).toString("latin1") === "GIF87a" || data.subarray(0, 6).toString("latin1") === "GIF89a")) return "gif";
  if (data.length >= 12 && data.subarray(0, 4).toString("latin1") === "RIFF" && data.subarray(8, 12).toString("latin1") === "WEBP") return "webp";
  return null;
}

/**
 * Detects the real type of an expense receipt from its leading bytes. Returns the canonical extension, or null
 * when the content does not match an allowed type. Office files: OOXML (zip container) or legacy OLE2.
 */
export function sniffReceipt(data: Buffer, claimedExt: string): string | null {
  const image = sniffImage(data);
  if (image === "png" || image === "jpg") return image;
  if (data.length >= 5 && data.subarray(0, 5).toString("latin1") === "%PDF-") return "pdf";
  const ext = claimedExt.toLowerCase();
  const zip = data.length >= 4 && data[0] === 0x50 && data[1] === 0x4b && data[2] === 0x03 && data[3] === 0x04;
  if (zip && ["docx", "xlsx", "pptx"].includes(ext)) return ext;
  const ole = data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
  if (ole && ["doc", "xls", "ppt"].includes(ext)) return ext;
  return null;
}

/** Types that browsers may render inline from the receipt route; everything else is forced to download. */
export const INLINE_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp", "pdf"];

/** `Content-Disposition` value with an ASCII fallback and an RFC 5987 UTF-8 filename. */
export function contentDisposition(kind: "inline" | "attachment", name: string): string {
  const clean = name.replace(/[\r\n"\\/]/g, "_").slice(0, 150) || "file";
  const ascii = clean.replace(/[^\x20-\x7e]/g, "_");
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(clean)}`;
}
