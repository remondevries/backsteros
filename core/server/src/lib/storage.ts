import { createHash } from "node:crypto";
import {
  access,
  constants,
  mkdir,
  readFile,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

const DEFAULT_CONTENT_TYPE = "text/markdown; charset=utf-8";
const SNIPPET_LENGTH = 500;

/** In-memory vault root (warmed from workspace settings or env). */
let vaultPathCache: string | null = null;

export const VAULT_ROOT_FOLDERS = [
  "Journal",
  "Projects",
  "Letters",
  "Knowledge Base",
  ".backsteros",
  path.join(".backsteros", "avatars"),
] as const;

export function setVaultPathCache(vaultPath: string | null): void {
  const trimmed = vaultPath?.trim() || null;
  vaultPathCache = trimmed;
}

export function getVaultPathCache(): string | null {
  return vaultPathCache;
}

function envVaultPath(): string | null {
  const value = process.env.BACKSTEROS_VAULT_PATH?.trim();
  return value || null;
}

/** True when a local vault path is configured (cache or env). */
export function isStorageConfigured(): boolean {
  return Boolean(vaultPathCache || envVaultPath());
}

/** @deprecated Use isStorageConfigured — kept for health/bootstrap field names. */
export function isSpacesConfigured(): boolean {
  return isStorageConfigured();
}

export async function resolveVaultPath(
  settingsVaultPath?: string | null,
): Promise<string> {
  const fromSettings = settingsVaultPath?.trim() || null;
  const resolved = fromSettings || vaultPathCache || envVaultPath();
  if (!resolved) {
    throw new Error("STORAGE_NOT_CONFIGURED");
  }
  if (fromSettings) {
    vaultPathCache = fromSettings;
  }
  return path.resolve(resolved);
}

function safeSegment(value: string): string {
  const normalized = value
    .replace(/[<>:"|?*\u0000-\u001f]/g, "_")
    .replace(/[/\\]+/g, "_")
    .replace(/^\.+/, "")
    .trim();
  if (!normalized || normalized === "." || normalized === "..") {
    throw new Error("INVALID_STORAGE_SEGMENT");
  }
  return normalized;
}

function safePath(relativePath: string): string {
  return relativePath
    .replace(/^\/+/, "")
    .split(/[/\\]+/)
    .filter((segment) => segment && segment !== "." && segment !== "..")
    .map(safeSegment)
    .join("/");
}

function ensureMarkdownExtension(filePath: string): string {
  if (/\.md$/i.test(filePath)) return filePath;
  return `${filePath}.md`;
}

/**
 * Obsidian-style vault-relative keys:
 * Journal/{date}.md
 * Projects/{projectKey}/Documents/{path}.md
 * Knowledge Base/{path}.md
 */
export function buildStorageKey(
  type: "project" | "knowledge" | "journal",
  documentPath: string,
  projectKey?: string,
  _workspaceId?: string,
): string {
  const normalizedPath = safePath(documentPath);
  if (!normalizedPath) {
    throw new Error("INVALID_STORAGE_SEGMENT");
  }

  switch (type) {
    case "journal": {
      const base = normalizedPath.replace(/\.md$/i, "");
      return path.posix.join("Journal", ensureMarkdownExtension(base));
    }
    case "knowledge":
      return path.posix.join(
        "Knowledge Base",
        ensureMarkdownExtension(normalizedPath),
      );
    case "project": {
      if (!projectKey) {
        throw new Error("PROJECT_KEY_REQUIRED");
      }
      return path.posix.join(
        "Projects",
        safeSegment(projectKey),
        "Documents",
        ensureMarkdownExtension(normalizedPath),
      );
    }
  }
}

/** Letter PDFs: Letters/YYYY/MM/YYYY-MM-DD - Subject.pdf */
export function buildLetterPdfStorageKey(input: {
  title: string;
  receivedDate?: Date | string | null;
  attachmentId?: string;
}): string {
  const when =
    input.receivedDate instanceof Date
      ? input.receivedDate
      : input.receivedDate
        ? new Date(input.receivedDate)
        : new Date();
  const yyyy = String(when.getUTCFullYear());
  const mm = String(when.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(when.getUTCDate()).padStart(2, "0");
  const dateStamp = `${yyyy}-${mm}-${dd}`;
  const subject = safeSegment(input.title.trim() || "Letter");
  const suffix = input.attachmentId
    ? ` (${safeSegment(input.attachmentId.slice(0, 8))})`
    : "";
  const fileName = `${dateStamp} - ${subject}${suffix}.pdf`;
  return path.posix.join("Letters", yyyy, mm, fileName);
}

/** Private/system blobs stay under .backsteros (not for Obsidian browsing). */
export function buildPrivateStorageKey(
  _workspaceId: string,
  category: "pdfs" | "avatars",
  entityId: string,
  fileName: string,
): string {
  if (category === "avatars") {
    return path.posix.join(
      ".backsteros",
      "avatars",
      safeSegment(entityId),
      safeSegment(fileName),
    );
  }
  // Legacy pdf helper — prefer buildLetterPdfStorageKey for new letters.
  return path.posix.join(
    ".backsteros",
    "pdfs",
    safeSegment(entityId),
    safeSegment(fileName),
  );
}

export function assertPrivateStorageKey(
  _workspaceId: string,
  key: string,
): void {
  assertVaultRelativeKey(key);
}

export function assertVaultRelativeKey(key: string): void {
  const normalized = key.replace(/\\/g, "/");
  if (
    !normalized ||
    normalized.startsWith("/") ||
    normalized.includes("..") ||
    path.isAbsolute(key)
  ) {
    throw new Error("STORAGE_KEY_OUTSIDE_WORKSPACE");
  }
}

export function checksumForContent(content: string | Uint8Array): string {
  return createHash("sha256")
    .update(typeof content === "string" ? Buffer.from(content, "utf8") : content)
    .digest("hex");
}

export function snippetForContent(content: string): string {
  const trimmed = content.trim();
  if (trimmed.length <= SNIPPET_LENGTH) {
    return trimmed;
  }
  return `${trimmed.slice(0, SNIPPET_LENGTH)}…`;
}

async function absolutePathForKey(
  key: string,
  settingsVaultPath?: string | null,
): Promise<string> {
  assertVaultRelativeKey(key);
  const root = await resolveVaultPath(settingsVaultPath);
  const absolute = path.resolve(root, key);
  const rootWithSep = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (absolute !== root && !absolute.startsWith(rootWithSep)) {
    throw new Error("STORAGE_KEY_OUTSIDE_WORKSPACE");
  }
  return absolute;
}

export async function ensureVaultStructure(
  vaultPath: string,
): Promise<void> {
  const root = path.resolve(vaultPath);
  await mkdir(root, { recursive: true });
  for (const folder of VAULT_ROOT_FOLDERS) {
    await mkdir(path.join(root, folder), { recursive: true });
  }
  // Keep an empty placeholder so Obsidian shows the folder.
  const gitkeep = path.join(root, "Projects", ".gitkeep");
  try {
    await access(gitkeep, constants.F_OK);
  } catch {
    await writeFile(gitkeep, "", "utf8");
  }
}

export async function ensureProjectVaultFolders(
  projectKey: string,
  settingsVaultPath?: string | null,
): Promise<void> {
  const root = await resolveVaultPath(settingsVaultPath);
  const projectRoot = path.join(root, "Projects", safeSegment(projectKey));
  for (const name of ["Codebase", "Documents", "Updates"] as const) {
    await mkdir(path.join(projectRoot, name), { recursive: true });
  }
}

export async function assertVaultPathUsable(vaultPath: string): Promise<void> {
  const root = path.resolve(vaultPath.trim());
  await mkdir(root, { recursive: true });
  await access(root, constants.R_OK | constants.W_OK);
  await ensureVaultStructure(root);
}

export async function putObject(
  key: string,
  body: string | Uint8Array,
  contentType = DEFAULT_CONTENT_TYPE,
  settingsVaultPath?: string | null,
): Promise<{ etag: string | null; byteSize: number }> {
  void contentType;
  const absolute = await absolutePathForKey(key, settingsVaultPath);
  await mkdir(path.dirname(absolute), { recursive: true });
  const bytes =
    typeof body === "string" ? Buffer.from(body, "utf8") : Buffer.from(body);
  await writeFile(absolute, bytes);
  return {
    etag: checksumForContent(bytes).slice(0, 32),
    byteSize: bytes.byteLength,
  };
}

export async function getObject(
  key: string,
  settingsVaultPath?: string | null,
): Promise<{
  body: string;
  bytes: Uint8Array;
  etag: string | null;
  contentType: string;
  byteSize: number;
}> {
  const absolute = await absolutePathForKey(key, settingsVaultPath);
  let bytes: Buffer;
  try {
    bytes = await readFile(absolute);
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code)
        : "";
    if (code === "ENOENT") {
      throw new Error("STORAGE_OBJECT_NOT_FOUND");
    }
    throw error;
  }
  const isPdf = absolute.toLowerCase().endsWith(".pdf");
  return {
    body: bytes.toString("utf8"),
    bytes,
    etag: checksumForContent(bytes).slice(0, 32),
    contentType: isPdf ? "application/pdf" : DEFAULT_CONTENT_TYPE,
    byteSize: bytes.byteLength,
  };
}

export async function deleteObject(
  key: string,
  settingsVaultPath?: string | null,
): Promise<void> {
  const absolute = await absolutePathForKey(key, settingsVaultPath);
  try {
    await unlink(absolute);
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code)
        : "";
    if (code === "ENOENT") return;
    throw error;
  }
}
