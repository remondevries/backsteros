import { createHash } from "node:crypto";
import {
  access,
  constants,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  rmdir,
  stat,
  unlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import {
  PROJECT_VAULT_WORKFLOW_SKILL_ID,
  PROJECT_VAULT_WORKFLOW_SKILL_MARKDOWN,
} from "./project-vault-skill.js";
import {
  copyR2Object,
  deleteR2Object,
  getR2Object,
  headR2Object,
  isR2Configured,
  putR2Object,
  shouldRefreshLocalFromRemote,
} from "./r2-object-store.js";

const DEFAULT_CONTENT_TYPE = "text/markdown; charset=utf-8";
const SNIPPET_LENGTH = 500;

/** Always created under every project vault folder. */
export const PROJECT_VAULT_BASE_FOLDERS = ["Documents", "Updates"] as const;

/** Only created when the project type is `codebase`. */
export const PROJECT_VAULT_CODEBASE_FOLDER = "Codebase" as const;

/** @deprecated Prefer PROJECT_VAULT_BASE_FOLDERS + optional Codebase. */
export const PROJECT_VAULT_AREA_FOLDERS = [
  PROJECT_VAULT_CODEBASE_FOLDER,
  ...PROJECT_VAULT_BASE_FOLDERS,
] as const;

export type ProjectVaultFolderOptions = {
  /** When `"codebase"`, also create the Codebase area folder. */
  projectType?: string | null;
};

/** Product Spaces vault root (formerly “Knowledge Base”). */
export const VAULT_SPACES_FOLDER = "Spaces";
/** Pre-rename vault folder — still resolved for existing files. */
export const VAULT_SPACES_FOLDER_LEGACY = "Knowledge Base";

/** Top-level category folders under `Spaces/` (vault + document path slugs). */
export const SPACES_CATEGORY_KNOWLEDGE_BASE = "knowledge-base";
export const SPACES_CATEGORY_SUPPORT = "support";
export const SPACES_CATEGORY_WEBSITES = "websites";

export const SPACES_SECOND_BRAIN_FOLDER = "second-brain";

/** Vault-relative path for the default Second brain space. */
export const SPACES_SECOND_BRAIN_RELATIVE = path.posix.join(
  SPACES_CATEGORY_KNOWLEDGE_BASE,
  SPACES_SECOND_BRAIN_FOLDER,
);

/** Directories always ensured under `Spaces/`. */
export const SPACES_HIERARCHY_FOLDERS = [
  SPACES_CATEGORY_KNOWLEDGE_BASE,
  SPACES_SECOND_BRAIN_RELATIVE,
  SPACES_CATEGORY_SUPPORT,
  SPACES_CATEGORY_WEBSITES,
] as const;

const SPACES_TOP_LEVEL_CATEGORY_NAMES = new Set<string>([
  SPACES_CATEGORY_KNOWLEDGE_BASE,
  SPACES_CATEGORY_SUPPORT,
  SPACES_CATEGORY_WEBSITES,
]);

/** In-memory vault root (warmed from workspace settings or env). */
let vaultPathCache: string | null = null;

export const VAULT_ROOT_FOLDERS = [
  "Journal",
  "Projects",
  "Letters",
  VAULT_SPACES_FOLDER,
  ".backsteros",
  path.join(".backsteros", "avatars"),
  path.join(".backsteros", "attachments"),
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

/** cloud-core must use BACKSTEROS_VAULT_PATH — never a laptop path replicated via settings. */
export function isCloudCoreVaultHost(): boolean {
  return process.env.CORE_REPLICATION_ROLE?.trim().toLowerCase() === "cloud";
}

/** True when a local vault path is configured (cache or env). */
export function isStorageConfigured(): boolean {
  if (isCloudCoreVaultHost()) {
    return Boolean(envVaultPath());
  }
  return Boolean(vaultPathCache || envVaultPath());
}

/** @deprecated Use isStorageConfigured — kept for health/bootstrap field names. */
export function isSpacesConfigured(): boolean {
  return isStorageConfigured();
}

export async function resolveVaultPath(
  settingsVaultPath?: string | null,
): Promise<string> {
  if (isCloudCoreVaultHost()) {
    const envPath = envVaultPath();
    if (!envPath) {
      throw new Error("STORAGE_NOT_CONFIGURED");
    }
    const resolved = path.resolve(envPath);
    vaultPathCache = resolved;
    return resolved;
  }

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
 * Spaces/{path}.md
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
        VAULT_SPACES_FOLDER,
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

/**
 * Calendar day used for letter PDF filing.
 * Prefer Received Date; fall back to today. Uses local calendar parts so a
 * date-picker value stored as local midnight matches the UI day (not UTC).
 */
export function letterFilingCalendarParts(
  receivedDate?: Date | string | null,
  now: Date = new Date(),
): { yyyy: string; mm: string; dd: string; dateStamp: string } {
  const when =
    receivedDate instanceof Date
      ? receivedDate
      : receivedDate
        ? new Date(receivedDate)
        : now;
  const resolved = Number.isNaN(when.getTime()) ? now : when;
  const yyyy = String(resolved.getFullYear());
  const mm = String(resolved.getMonth() + 1).padStart(2, "0");
  const dd = String(resolved.getDate()).padStart(2, "0");
  return { yyyy, mm, dd, dateStamp: `${yyyy}-${mm}-${dd}` };
}

/**
 * Vault/file subject from a PDF display name.
 * Strips `.pdf` and a leading `YYYY-MM-DD - ` so filing can re-apply Received Date.
 */
export function letterPdfSubjectFromFilename(filename: string): string {
  const withoutExt = filename.trim().replace(/\.pdf$/i, "").trim();
  const withoutLeadingDate = withoutExt
    .replace(/^\d{4}-\d{2}-\d{2}\s*-\s*/, "")
    .trim();
  return withoutLeadingDate || withoutExt || "Letter";
}

/** Letter PDFs: Letters/YYYY/MM/YYYY-MM-DD - Subject.pdf */
export function buildLetterPdfStorageKey(input: {
  title: string;
  /** Prefer over title when set (renamed PDF / upload basename). */
  subject?: string | null;
  receivedDate?: Date | string | null;
  attachmentId?: string;
}): string {
  const { yyyy, mm, dateStamp } = letterFilingCalendarParts(input.receivedDate);
  const subject = safeSegment(
    (input.subject?.trim() || input.title.trim() || "Letter"),
  );
  const suffix = input.attachmentId
    ? ` (${safeSegment(input.attachmentId.slice(0, 8))})`
    : "";
  const fileName = `${dateStamp} - ${subject}${suffix}.pdf`;
  return path.posix.join("Letters", yyyy, mm, fileName);
}

/** Private/system blobs stay under .backsteros (not for Obsidian browsing). */
export function buildPrivateStorageKey(
  _workspaceId: string,
  category: "pdfs" | "avatars" | "attachments" | "finance-imports" | "space-covers",
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
  if (category === "space-covers") {
    return path.posix.join(
      ".backsteros",
      "space-covers",
      safeSegment(entityId),
      safeSegment(fileName),
    );
  }
  if (category === "attachments") {
    return path.posix.join(
      ".backsteros",
      "attachments",
      "tasks",
      safeSegment(entityId),
      safeSegment(fileName),
    );
  }
  if (category === "finance-imports") {
    return path.posix.join(
      ".backsteros",
      "finance-imports",
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

/** Space folder cover / OG image under `.backsteros/space-covers/{spaceId}/cover`. */
export function buildSpaceCoverStorageKey(spaceDocumentId: string): string {
  return buildPrivateStorageKey("", "space-covers", spaceDocumentId, "cover");
}

/** Task description images under `.backsteros/attachments/tasks/{taskId}/…`. */
export function buildTaskImageStorageKey(
  taskId: string,
  imageId: string,
  extension: string,
): string {
  const ext = safeSegment(extension.replace(/^\./, "") || "bin");
  return buildPrivateStorageKey(
    "",
    "attachments",
    taskId,
    `${safeSegment(imageId)}.${ext}`,
  );
}

/** Task file attachments under `.backsteros/attachments/tasks/{taskId}/…`. */
export function buildTaskAttachmentStorageKey(
  taskId: string,
  attachmentId: string,
  fileName: string,
): string {
  const trimmed = fileName.trim() || "attachment";
  const extMatch = trimmed.match(/\.([a-z0-9]{1,16})$/i);
  const ext = safeSegment(extMatch?.[1]?.toLowerCase() || "bin");
  const baseName = extMatch
    ? trimmed.slice(0, -extMatch[0].length)
    : trimmed;
  const base = safeSegment(baseName.trim() || "attachment");
  const suffix = safeSegment(attachmentId.slice(0, 8) || "att");
  return buildPrivateStorageKey(
    "",
    "attachments",
    taskId,
    `${base}-${suffix}.${ext}`,
  );
}

/** @deprecated Use {@link buildTaskAttachmentStorageKey}. */
export function buildTaskPdfAttachmentStorageKey(
  taskId: string,
  attachmentId: string,
  fileName: string,
): string {
  return buildTaskAttachmentStorageKey(taskId, attachmentId, fileName);
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

/** Map legacy `Knowledge Base/…` keys into Second brain under Spaces. */
export function normalizeVaultRelativeKey(key: string): string {
  return rewriteLegacyKnowledgeBaseStorageKey(key);
}

function vaultAbsoluteCandidates(root: string, key: string): string[] {
  const preferredKey = normalizeVaultRelativeKey(key);
  const preferred = path.resolve(root, preferredKey);
  const candidates = [preferred];
  const seen = new Set([preferred]);

  const add = (relative: string) => {
    const absolute = path.resolve(root, relative);
    if (seen.has(absolute)) return;
    seen.add(absolute);
    candidates.push(absolute);
  };

  // Pre-Second-brain Spaces layout: Spaces/{path}
  const posix = key.replace(/\\/g, "/");
  if (
    posix === VAULT_SPACES_FOLDER_LEGACY ||
    posix.startsWith(`${VAULT_SPACES_FOLDER_LEGACY}/`)
  ) {
    add(`${VAULT_SPACES_FOLDER}${posix.slice(VAULT_SPACES_FOLDER_LEGACY.length)}`);
    add(posix);
  }

  // Preferred Spaces/knowledge-base/second-brain/… also try legacy KB root.
  if (
    preferredKey === path.posix.join(VAULT_SPACES_FOLDER, SPACES_SECOND_BRAIN_RELATIVE) ||
    preferredKey.startsWith(
      `${path.posix.join(VAULT_SPACES_FOLDER, SPACES_SECOND_BRAIN_RELATIVE)}/`,
    )
  ) {
    const suffix = preferredKey.slice(
      path.posix.join(VAULT_SPACES_FOLDER, SPACES_SECOND_BRAIN_RELATIVE).length,
    );
    add(`${VAULT_SPACES_FOLDER_LEGACY}${suffix}`);
  }

  // Portal space moved Support ← Second brain. Metadata may already point at
  // Spaces/support/portal/… while bytes remain under second-brain/portal/….
  const supportPortalPrefix = path.posix.join(
    VAULT_SPACES_FOLDER,
    SPACES_CATEGORY_SUPPORT,
    "portal",
  );
  const secondBrainPortalPrefix = path.posix.join(
    VAULT_SPACES_FOLDER,
    SPACES_SECOND_BRAIN_RELATIVE,
    "portal",
  );
  if (
    preferredKey === supportPortalPrefix ||
    preferredKey.startsWith(`${supportPortalPrefix}/`)
  ) {
    const suffix = preferredKey.slice(supportPortalPrefix.length);
    add(`${secondBrainPortalPrefix}${suffix}`);
  }
  if (
    preferredKey === secondBrainPortalPrefix ||
    preferredKey.startsWith(`${secondBrainPortalPrefix}/`)
  ) {
    const suffix = preferredKey.slice(secondBrainPortalPrefix.length);
    add(`${supportPortalPrefix}${suffix}`);
  }

  return candidates;
}

async function absolutePathForKey(
  key: string,
  settingsVaultPath?: string | null,
  mode: "read" | "write" = "read",
): Promise<string> {
  assertVaultRelativeKey(key);
  const root = await resolveVaultPath(settingsVaultPath);
  const rootWithSep = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  const candidates = vaultAbsoluteCandidates(root, key);
  const preferred = candidates[0]!;

  if (mode === "write") {
    // Never recreate legacy Knowledge Base/ — always write the preferred Spaces path.
    if (preferred !== root && !preferred.startsWith(rootWithSep)) {
      throw new Error("STORAGE_KEY_OUTSIDE_WORKSPACE");
    }
    return preferred;
  }

  for (const absolute of candidates) {
    if (absolute !== root && !absolute.startsWith(rootWithSep)) {
      throw new Error("STORAGE_KEY_OUTSIDE_WORKSPACE");
    }
    try {
      await access(absolute, constants.F_OK);
      return absolute;
    } catch {
      // try next candidate
    }
  }
  if (preferred !== root && !preferred.startsWith(rootWithSep)) {
    throw new Error("STORAGE_KEY_OUTSIDE_WORKSPACE");
  }
  return preferred;
}

/**
 * Move loose files/folders at the Spaces root into Second brain so the
 * category layout (Knowledge Base / Support / Websites) stays clean.
 */
async function migrateLooseSpacesEntries(spacesRoot: string): Promise<void> {
  const secondBrain = path.join(
    spacesRoot,
    ...SPACES_SECOND_BRAIN_RELATIVE.split("/"),
  );
  await mkdir(secondBrain, { recursive: true });
  let entries;
  try {
    entries = await readdir(spacesRoot, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    if (SPACES_TOP_LEVEL_CATEGORY_NAMES.has(entry.name)) continue;
    await movePathBestEffort(
      path.join(spacesRoot, entry.name),
      path.join(secondBrain, entry.name),
    );
  }
}

/**
 * When `Spaces/` was created beside a legacy vault-root `Knowledge Base/`,
 * merge that folder’s contents into Second brain (do not leave files stranded).
 */
async function migrateLegacyKnowledgeBaseBesideSpaces(
  vaultRoot: string,
  spacesRoot: string,
): Promise<void> {
  const legacy = path.join(vaultRoot, VAULT_SPACES_FOLDER_LEGACY);
  try {
    await access(legacy, constants.F_OK);
  } catch {
    return;
  }

  const secondBrain = path.join(
    spacesRoot,
    ...SPACES_SECOND_BRAIN_RELATIVE.split("/"),
  );
  await mkdir(secondBrain, { recursive: true });

  let entries;
  try {
    entries = await readdir(legacy, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    await movePathBestEffort(
      path.join(legacy, entry.name),
      path.join(secondBrain, entry.name),
    );
  }

  try {
    const leftover = await readdir(legacy);
    const meaningful = leftover.filter((name) => !name.startsWith("."));
    if (meaningful.length === 0) {
      await rm(legacy, { recursive: true, force: true });
    }
  } catch {
    // leave legacy folder if cleanup fails
  }
}

async function movePathBestEffort(from: string, to: string): Promise<void> {
  if (path.resolve(from) === path.resolve(to)) return;
  try {
    await access(to, constants.F_OK);
  } catch {
    try {
      await mkdir(path.dirname(to), { recursive: true });
      await rename(from, to);
    } catch {
      // best-effort migration
    }
    return;
  }

  // Destination exists — merge directories; for files keep newer then drop source.
  let fromStat;
  let toStat;
  try {
    fromStat = await stat(from);
    toStat = await stat(to);
  } catch {
    return;
  }

  if (fromStat.isDirectory() && toStat.isDirectory()) {
    const fromEntries = await readdir(from, { withFileTypes: true }).catch(
      () => null,
    );
    if (fromEntries) {
      for (const entry of fromEntries) {
        if (entry.name.startsWith(".")) continue;
        await movePathBestEffort(
          path.join(from, entry.name),
          path.join(to, entry.name),
        );
      }
    }
    try {
      await rm(from, { recursive: true, force: true });
    } catch {
      // leave non-empty leftovers
    }
    return;
  }

  if (fromStat.isFile() && toStat.isFile()) {
    // Destination already has the note (canonical Second brain) — drop the
    // leftover Knowledge Base copy so the legacy tree can be removed.
    try {
      await unlink(from);
    } catch {
      // best-effort
    }
    return;
  }

  // Type mismatch — prefer destination layout; drop the legacy path.
  try {
    await rm(from, { recursive: true, force: true });
  } catch {
    // best-effort
  }
}

/** Rewrite vault-relative storage keys after Knowledge Base → Second brain move. */
export function rewriteLegacyKnowledgeBaseStorageKey(key: string): string {
  const posix = key.replace(/\\/g, "/");
  const prefix = `${VAULT_SPACES_FOLDER_LEGACY}/`;
  if (posix === VAULT_SPACES_FOLDER_LEGACY) {
    return path.posix.join(VAULT_SPACES_FOLDER, SPACES_SECOND_BRAIN_RELATIVE);
  }
  if (posix.startsWith(prefix)) {
    return path.posix.join(
      VAULT_SPACES_FOLDER,
      SPACES_SECOND_BRAIN_RELATIVE,
      posix.slice(prefix.length),
    );
  }
  return key;
}

export async function ensureVaultStructure(
  vaultPath: string,
): Promise<void> {
  const root = path.resolve(vaultPath);
  await mkdir(root, { recursive: true });

  const legacySpaces = path.join(root, VAULT_SPACES_FOLDER_LEGACY);
  const spaces = path.join(root, VAULT_SPACES_FOLDER);
  try {
    await access(legacySpaces, constants.F_OK);
    try {
      await access(spaces, constants.F_OK);
    } catch {
      await rename(legacySpaces, spaces);
    }
  } catch {
    // no legacy folder
  }

  for (const folder of VAULT_ROOT_FOLDERS) {
    await mkdir(path.join(root, folder), { recursive: true });
  }

  for (const relative of SPACES_HIERARCHY_FOLDERS) {
    await mkdir(path.join(spaces, ...relative.split("/")), {
      recursive: true,
    });
  }
  // Merge a leftover vault-root "Knowledge Base/" into Second brain when both
  // it and Spaces/ exist (rename-only migration cannot run in that case).
  await migrateLegacyKnowledgeBaseBesideSpaces(root, spaces);
  await migrateLooseSpacesEntries(spaces);

  // Keep an empty placeholder so Obsidian shows the folder.
  const gitkeep = path.join(root, "Projects", ".gitkeep");
  try {
    await access(gitkeep, constants.F_OK);
  } catch {
    await writeFile(gitkeep, "", "utf8");
  }
}

/** Vault-relative project root: `Projects/{KEY}`. */
export function buildProjectVaultRelativeRoot(projectKey: string): string {
  return path.posix.join("Projects", safeSegment(projectKey));
}

/** Absolute path to a project's vault folder under the configured vault root. */
export function buildProjectVaultAbsolutePath(
  vaultRoot: string,
  projectKey: string,
): string {
  return path.join(
    path.resolve(vaultRoot),
    "Projects",
    safeSegment(projectKey),
  );
}

export type EnsureProjectVaultFoldersResult = {
  projectVaultPath: string;
  createdSkill: boolean;
};

export type RenameProjectVaultFolderResult = {
  projectVaultPath: string;
  renamed: boolean;
  previousProjectVaultPath: string | null;
};

async function directoryHasFiles(dir: string): Promise<boolean> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const absolute = path.join(dir, entry.name);
    if (entry.isFile()) return true;
    if (entry.isDirectory()) {
      if (await directoryHasFiles(absolute)) return true;
    }
  }
  return false;
}

/**
 * Rename `Projects/{fromKey}` → `Projects/{toKey}` after a project code change.
 * No-op when the source folder is missing (caller should ensure the new path).
 */
export async function renameProjectVaultFolder(
  fromKey: string,
  toKey: string,
  settingsVaultPath?: string | null,
): Promise<RenameProjectVaultFolderResult> {
  const root = await resolveVaultPath(settingsVaultPath);
  const fromPath = buildProjectVaultAbsolutePath(root, fromKey);
  const toPath = buildProjectVaultAbsolutePath(root, toKey);

  if (fromPath === toPath) {
    return {
      projectVaultPath: toPath,
      renamed: false,
      previousProjectVaultPath: null,
    };
  }

  try {
    await access(fromPath, constants.F_OK);
  } catch {
    return {
      projectVaultPath: toPath,
      renamed: false,
      previousProjectVaultPath: null,
    };
  }

  let destinationExists = false;
  try {
    await access(toPath, constants.F_OK);
    destinationExists = true;
  } catch (error) {
    if (
      !(
        error &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code?: string }).code === "ENOENT"
      )
    ) {
      throw error;
    }
  }

  if (destinationExists) {
    if (await directoryHasFiles(toPath)) {
      throw new Error("PROJECT_VAULT_TARGET_EXISTS");
    }
    await rm(toPath, { recursive: true, force: true });
  }

  await mkdir(path.dirname(toPath), { recursive: true });
  await rename(fromPath, toPath);
  return {
    projectVaultPath: toPath,
    renamed: true,
    previousProjectVaultPath: fromPath,
  };
}

/**
 * Rewrite vault-relative document keys when a project code changes.
 * `Projects/{from}/…` → `Projects/{to}/…`
 */
export function rewriteProjectStorageKeyPrefix(
  storageKey: string,
  fromProjectKey: string,
  toProjectKey: string,
): string | null {
  const fromPrefix = `${buildProjectVaultRelativeRoot(fromProjectKey)}/`;
  const toPrefix = `${buildProjectVaultRelativeRoot(toProjectKey)}/`;
  if (!storageKey.startsWith(fromPrefix)) return null;
  return `${toPrefix}${storageKey.slice(fromPrefix.length)}`;
}

/**
 * Map an absolute local working directory under the old vault project root
 * onto the renamed root (or return null when it is unrelated).
 */
export function rewriteProjectVaultWorkingDirectory(
  localWorkingDirectory: string | null | undefined,
  fromProjectVaultPath: string,
  toProjectVaultPath: string,
): string | null {
  const current = localWorkingDirectory?.trim() || null;
  if (!current) return null;
  const fromRoot = path.resolve(fromProjectVaultPath);
  const toRoot = path.resolve(toProjectVaultPath);
  const resolved = path.resolve(current);
  if (resolved === fromRoot) return toRoot;
  const fromWithSep = fromRoot.endsWith(path.sep)
    ? fromRoot
    : `${fromRoot}${path.sep}`;
  if (!resolved.startsWith(fromWithSep)) return null;
  return path.join(toRoot, resolved.slice(fromWithSep.length));
}

/**
 * Remove an empty Codebase area left over from older bootstraps that always
 * created it. Non-empty folders are left alone.
 */
async function removeEmptyCodebaseFolder(projectRoot: string): Promise<void> {
  const codebaseDir = path.join(projectRoot, PROJECT_VAULT_CODEBASE_FOLDER);
  try {
    const entries = await readdir(codebaseDir);
    if (entries.length === 0) {
      await rmdir(codebaseDir);
    }
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "ENOENT"
    ) {
      return;
    }
    // Busy / permission / not a directory — leave as-is.
  }
}

/**
 * Ensure every project has a vault folder (even with no documents), plus a
 * `.cursor/skills` seed so agent chats started in this folder pick up project
 * rules/skills. `Codebase/` is only created for codebase projects.
 */
export async function ensureProjectVaultFolders(
  projectKey: string,
  settingsVaultPath?: string | null,
  options?: ProjectVaultFolderOptions,
): Promise<EnsureProjectVaultFoldersResult> {
  const root = await resolveVaultPath(settingsVaultPath);
  const projectRoot = buildProjectVaultAbsolutePath(root, projectKey);
  const isCodebase = options?.projectType === "codebase";

  for (const name of PROJECT_VAULT_BASE_FOLDERS) {
    await mkdir(path.join(projectRoot, name), { recursive: true });
  }
  if (isCodebase) {
    await mkdir(
      path.join(projectRoot, PROJECT_VAULT_CODEBASE_FOLDER),
      { recursive: true },
    );
  } else {
    await removeEmptyCodebaseFolder(projectRoot);
  }

  const skillDir = path.join(
    projectRoot,
    ".cursor",
    "skills",
    PROJECT_VAULT_WORKFLOW_SKILL_ID,
  );
  await mkdir(skillDir, { recursive: true });

  const skillPath = path.join(skillDir, "SKILL.md");
  let createdSkill = false;
  try {
    await access(skillPath, constants.F_OK);
  } catch {
    await writeFile(skillPath, PROJECT_VAULT_WORKFLOW_SKILL_MARKDOWN, "utf8");
    createdSkill = true;
  }

  return { projectVaultPath: projectRoot, createdSkill };
}

export async function assertVaultPathUsable(vaultPath: string): Promise<void> {
  const root = path.resolve(vaultPath.trim());
  await mkdir(root, { recursive: true });
  await access(root, constants.R_OK | constants.W_OK);
  await ensureVaultStructure(root);
}

function r2ObjectKey(key: string): string {
  return normalizeVaultRelativeKey(key).replace(/\\/g, "/");
}

async function refreshLocalFromR2(
  key: string,
  absolute: string,
  local: Buffer | null,
): Promise<Buffer | null> {
  if (!isR2Configured()) return local;
  const remoteKey = r2ObjectKey(key);
  let remote: { lastModifiedMs: number } | null = null;
  try {
    remote = await headR2Object(remoteKey);
  } catch (error) {
    console.warn("[storage] R2 head failed", remoteKey, error);
    return local;
  }
  if (!remote) return local;
  let localMtime: number | null = null;
  if (local) {
    try {
      localMtime = (await stat(absolute)).mtimeMs;
    } catch {
      localMtime = null;
    }
  }
  if (!shouldRefreshLocalFromRemote(localMtime, remote.lastModifiedMs)) {
    return local;
  }
  const downloaded = await getR2Object(remoteKey);
  if (!downloaded) return local;
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, downloaded.bytes);
  const stamped = new Date(remote.lastModifiedMs || Date.now());
  await utimes(absolute, stamped, stamped);
  return downloaded.bytes;
}

async function mirrorMoveToR2(
  fromKey: string,
  toKey: string,
  toAbsolute: string,
): Promise<void> {
  if (!isR2Configured()) return;
  const from = r2ObjectKey(fromKey);
  const to = r2ObjectKey(toKey);
  const copied = await copyR2Object(from, to);
  if (copied && from !== to) {
    await deleteR2Object(from);
    return;
  }
  const bytes = await readFile(toAbsolute);
  const contentType = toAbsolute.toLowerCase().endsWith(".pdf")
    ? "application/pdf"
    : "text/markdown; charset=utf-8";
  await putR2Object(to, bytes, contentType);
}

export async function putObject(
  key: string,
  body: string | Uint8Array,
  contentType = DEFAULT_CONTENT_TYPE,
  settingsVaultPath?: string | null,
): Promise<{ etag: string | null; byteSize: number }> {
  void contentType;
  const absolute = await absolutePathForKey(key, settingsVaultPath, "write");
  await mkdir(path.dirname(absolute), { recursive: true });
  const bytes =
    typeof body === "string" ? Buffer.from(body, "utf8") : Buffer.from(body);
  await writeFile(absolute, bytes);
  if (isR2Configured()) {
    await putR2Object(r2ObjectKey(key), bytes, contentType);
    const now = new Date();
    await utimes(absolute, now, now);
  }
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
  const preferred = await absolutePathForKey(key, settingsVaultPath, "write");
  let bytes: Buffer | null = null;
  try {
    bytes = await readFile(absolute);
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code)
        : "";
    if (code !== "ENOENT") throw error;
  }

  // Heal path drift (e.g. Portal under Support while bytes stay in Second brain).
  if (bytes && absolute !== preferred) {
    try {
      await mkdir(path.dirname(preferred), { recursive: true });
      try {
        await rename(absolute, preferred);
      } catch (error) {
        const code =
          error && typeof error === "object" && "code" in error
            ? String((error as { code?: unknown }).code)
            : "";
        if (code === "EXDEV") {
          await writeFile(preferred, bytes);
          await unlink(absolute);
        } else if (code !== "ENOENT") {
          // Preferred may already exist — keep serving bytes we read.
          console.warn(
            "[storage] vault reconcile after read failed",
            key,
            absolute,
            "→",
            preferred,
            error,
          );
        }
      }
    } catch (error) {
      console.warn("[storage] vault reconcile mkdir failed", key, error);
    }
  }

  const refreshed = await refreshLocalFromR2(key, preferred, bytes);
  if (refreshed) bytes = refreshed;
  if (!bytes) throw new Error("STORAGE_OBJECT_NOT_FOUND");

  const isPdf = preferred.toLowerCase().endsWith(".pdf");
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
    if (code === "ENOENT") {
      if (isR2Configured()) await deleteR2Object(r2ObjectKey(key));
      return;
    }
    throw error;
  }
  if (isR2Configured()) await deleteR2Object(r2ObjectKey(key));
}

/**
 * If bytes for `key` only exist at a legacy candidate path, move them to the
 * canonical preferred key. No-op when already aligned or missing.
 */
export async function reconcileObjectToPreferredKey(
  key: string,
  settingsVaultPath?: string | null,
): Promise<boolean> {
  const preferred = await absolutePathForKey(key, settingsVaultPath, "write");
  try {
    await access(preferred, constants.F_OK);
    return false;
  } catch {
    // continue — preferred missing
  }

  const found = await absolutePathForKey(key, settingsVaultPath, "read");
  if (found === preferred) {
    try {
      await access(preferred, constants.F_OK);
      return false;
    } catch {
      throw new Error("STORAGE_OBJECT_NOT_FOUND");
    }
  }

  await mkdir(path.dirname(preferred), { recursive: true });
  try {
    await rename(found, preferred);
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code)
        : "";
    if (code === "ENOENT") {
      throw new Error("STORAGE_OBJECT_NOT_FOUND");
    }
    if (code === "EXDEV") {
      const bytes = await readFile(found);
      await writeFile(preferred, bytes);
      await unlink(found);
      return true;
    }
    throw error;
  }
  return true;
}

/** Move a vault object to a new key (reconciles when keys match but path drifted). */
export async function moveObject(
  fromKey: string,
  toKey: string,
  settingsVaultPath?: string | null,
): Promise<void> {
  if (fromKey === toKey) {
    await reconcileObjectToPreferredKey(fromKey, settingsVaultPath);
    return;
  }
  const fromAbsolute = await absolutePathForKey(fromKey, settingsVaultPath);
  const toAbsolute = await absolutePathForKey(toKey, settingsVaultPath, "write");
  await mkdir(path.dirname(toAbsolute), { recursive: true });
  try {
    await rename(fromAbsolute, toAbsolute);
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code)
        : "";
    if (code === "ENOENT") {
      throw new Error("STORAGE_OBJECT_NOT_FOUND");
    }
    // Cross-device rename fallback.
    if (code === "EXDEV") {
      const bytes = await readFile(fromAbsolute);
      await writeFile(toAbsolute, bytes);
      await unlink(fromAbsolute);
      await mirrorMoveToR2(fromKey, toKey, toAbsolute);
      return;
    }
    throw error;
  }
  await mirrorMoveToR2(fromKey, toKey, toAbsolute);
}
