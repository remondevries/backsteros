/**
 * Sandboxed filesystem access under a codebase project's localWorkingDirectory.
 * Paths exposed to clients are relative (POSIX) from the working directory root.
 */
import {
  mkdir,
  readdir,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

export const MAX_TEXT_BYTES = 1_500_000;

const SKIP_NAMES = new Set([
  ".git",
  ".DS_Store",
  "node_modules",
  ".next",
  "dist",
  "build",
  "coverage",
  ".turbo",
  ".vercel",
]);

export type ProjectFsEntryKind = "file" | "directory";

export type ProjectFsEntry = {
  name: string;
  path: string;
  kind: ProjectFsEntryKind;
};

export class ProjectFsError extends Error {
  readonly code: string;
  readonly status: 400 | 403 | 404;

  constructor(message: string, code: string, status: 400 | 403 | 404 = 400) {
    super(message);
    this.name = "ProjectFsError";
    this.code = code;
    this.status = status;
  }
}

function looksBinary(bytes: Uint8Array): boolean {
  const sample = bytes.subarray(0, Math.min(bytes.length, 8_000));
  if (sample.includes(0)) return true;
  let suspicious = 0;
  for (const byte of sample) {
    if (byte < 7 || (byte > 13 && byte < 32)) suspicious += 1;
  }
  return sample.length > 0 && suspicious / sample.length > 0.3;
}

function normalizeRelativeInput(input: string | undefined | null): string {
  const raw = (input ?? "").trim().replace(/\\/g, "/");
  if (!raw || raw === ".") return "";
  if (raw.startsWith("/")) {
    throw new ProjectFsError(
      "Path must be relative to the working directory",
      "fs_path_outside_root",
    );
  }
  if (raw.split("/").some((segment) => segment === "..")) {
    throw new ProjectFsError(
      "Path must not contain '..'",
      "fs_path_outside_root",
    );
  }
  return raw.replace(/^\/+|\/+$/g, "");
}

function toRelative(rootReal: string, absolute: string): string {
  const rel = path.relative(rootReal, absolute);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new ProjectFsError(
      "Path is outside the project working directory",
      "fs_path_outside_root",
    );
  }
  return rel.split(path.sep).join("/");
}

function isPathInsideRoot(rootReal: string, candidateReal: string): boolean {
  const rootNorm = rootReal.endsWith(path.sep) ? rootReal : `${rootReal}${path.sep}`;
  return (
    candidateReal === rootReal || candidateReal.startsWith(rootNorm)
  );
}

async function resolveRoot(workingDirectory: string): Promise<string> {
  const trimmed = workingDirectory.trim();
  if (!trimmed || !path.isAbsolute(trimmed)) {
    throw new ProjectFsError(
      "No local working directory linked to this project",
      "fs_working_directory_missing",
    );
  }
  try {
    const real = await realpath(trimmed);
    const info = await stat(real);
    if (!info.isDirectory()) {
      throw new ProjectFsError(
        "Working directory is not a directory",
        "fs_working_directory_missing",
      );
    }
    return real;
  } catch (error) {
    if (error instanceof ProjectFsError) throw error;
    throw new ProjectFsError(
      "Working directory was not found on this host",
      "fs_working_directory_missing",
      404,
    );
  }
}

/**
 * Resolve a relative client path to an absolute path inside the jail.
 * For create targets that do not exist yet, resolves the parent and joins the name.
 */
async function resolveInsideRoot(
  rootReal: string,
  relativeInput: string,
  options?: { mustExist?: boolean },
): Promise<{ absolute: string; relative: string }> {
  const relative = normalizeRelativeInput(relativeInput);
  const joined = relative
    ? path.resolve(rootReal, ...relative.split("/"))
    : rootReal;

  if (options?.mustExist === false) {
    const parent = path.dirname(joined);
    let parentReal: string;
    try {
      parentReal = await realpath(parent);
    } catch {
      throw new ProjectFsError("Parent directory was not found", "fs_not_found", 404);
    }
    if (!isPathInsideRoot(rootReal, parentReal)) {
      throw new ProjectFsError(
        "Path is outside the project working directory",
        "fs_path_outside_root",
      );
    }
    const absolute = path.join(parentReal, path.basename(joined));
    if (!isPathInsideRoot(rootReal, absolute)) {
      throw new ProjectFsError(
        "Path is outside the project working directory",
        "fs_path_outside_root",
      );
    }
    return { absolute, relative: toRelative(rootReal, absolute) };
  }

  let absolute: string;
  try {
    absolute = await realpath(joined);
  } catch {
    throw new ProjectFsError("Path was not found", "fs_not_found", 404);
  }
  if (!isPathInsideRoot(rootReal, absolute)) {
    throw new ProjectFsError(
      "Path is outside the project working directory",
      "fs_path_outside_root",
    );
  }
  return { absolute, relative: toRelative(rootReal, absolute) };
}

export async function listEntries(
  workingDirectory: string,
  relativePath = "",
): Promise<{ path: string; entries: ProjectFsEntry[] }> {
  const rootReal = await resolveRoot(workingDirectory);
  const { absolute, relative } = await resolveInsideRoot(
    rootReal,
    relativePath,
  );
  const info = await stat(absolute);
  if (!info.isDirectory()) {
    throw new ProjectFsError("Path is not a directory", "fs_not_found", 400);
  }

  const dirents = await readdir(absolute, { withFileTypes: true });
  const entries: ProjectFsEntry[] = [];
  for (const dirent of dirents) {
    const name = dirent.name;
    if (!name || SKIP_NAMES.has(name) || name.startsWith(".")) continue;
    const childAbs = path.join(absolute, name);
    let kind: ProjectFsEntryKind | null = null;
    try {
      if (dirent.isDirectory()) kind = "directory";
      else if (dirent.isFile()) kind = "file";
      else {
        const childInfo = await stat(childAbs);
        if (childInfo.isDirectory()) kind = "directory";
        else if (childInfo.isFile()) kind = "file";
      }
    } catch {
      continue;
    }
    if (!kind) continue;
    const childRel = relative ? `${relative}/${name}` : name;
    entries.push({ name, path: childRel, kind });
  }
  entries.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
  return { path: relative, entries };
}

export async function readTextFile(
  workingDirectory: string,
  relativePath: string,
): Promise<{
  path: string;
  name: string;
  size: number;
  binary: boolean;
  content: string | null;
}> {
  const rootReal = await resolveRoot(workingDirectory);
  const { absolute, relative } = await resolveInsideRoot(
    rootReal,
    relativePath,
  );
  const info = await stat(absolute);
  if (!info.isFile()) {
    throw new ProjectFsError("Path is not a file", "fs_not_found", 400);
  }
  const size = info.size;
  if (size > MAX_TEXT_BYTES) {
    throw new ProjectFsError(
      `File is too large to open (max ${Math.round(MAX_TEXT_BYTES / 1024)} KB)`,
      "fs_file_too_large",
    );
  }
  const bytes = await readFile(absolute);
  const name = path.basename(absolute);
  if (looksBinary(bytes)) {
    return { path: relative, name, size, binary: true, content: null };
  }
  return {
    path: relative,
    name,
    size,
    binary: false,
    content: bytes.toString("utf8"),
  };
}

export async function writeTextFile(
  workingDirectory: string,
  relativePath: string,
  content: string,
): Promise<{
  path: string;
  name: string;
  size: number;
  binary: boolean;
  content: string;
}> {
  const byteLength = Buffer.byteLength(content, "utf8");
  if (byteLength > MAX_TEXT_BYTES) {
    throw new ProjectFsError(
      `File is too large to save (max ${Math.round(MAX_TEXT_BYTES / 1024)} KB)`,
      "fs_file_too_large",
    );
  }
  const rootReal = await resolveRoot(workingDirectory);
  const { absolute, relative } = await resolveInsideRoot(
    rootReal,
    relativePath,
  );
  const info = await stat(absolute);
  if (!info.isFile()) {
    throw new ProjectFsError("Path is not a file", "fs_not_found", 400);
  }
  const existing = await readFile(absolute);
  if (looksBinary(existing)) {
    throw new ProjectFsError(
      "Binary files cannot be edited",
      "fs_binary",
    );
  }
  await writeFile(absolute, content, "utf8");
  return {
    path: relative,
    name: path.basename(absolute),
    size: byteLength,
    binary: false,
    content,
  };
}

export async function createEntry(
  workingDirectory: string,
  parentRelative: string,
  name: string,
  kind: ProjectFsEntryKind,
): Promise<{
  path: string;
  name: string;
  kind: ProjectFsEntryKind;
  parent: string;
}> {
  if (
    !name ||
    name === "." ||
    name === ".." ||
    name.includes("/") ||
    name.includes("\\") ||
    name.includes("\0")
  ) {
    throw new ProjectFsError(
      "A valid file or folder name is required",
      "bad_request",
    );
  }

  const rootReal = await resolveRoot(workingDirectory);
  const parent = await resolveInsideRoot(rootReal, parentRelative);
  const parentInfo = await stat(parent.absolute);
  if (!parentInfo.isDirectory()) {
    throw new ProjectFsError("Parent is not a directory", "fs_not_found", 400);
  }

  const targetRelative = parent.relative
    ? `${parent.relative}/${name}`
    : name;
  const { absolute, relative } = await resolveInsideRoot(
    rootReal,
    targetRelative,
    { mustExist: false },
  );

  try {
    await stat(absolute);
    throw new ProjectFsError(
      "A file or folder with that name already exists",
      "fs_already_exists",
    );
  } catch (error) {
    if (error instanceof ProjectFsError) throw error;
  }

  if (kind === "directory") {
    await mkdir(absolute);
  } else {
    await writeFile(absolute, "", "utf8");
  }

  return {
    path: relative,
    name,
    kind,
    parent: parent.relative,
  };
}

export async function deleteEntry(
  workingDirectory: string,
  relativePath: string,
): Promise<{
  path: string;
  name: string;
  kind: ProjectFsEntryKind;
  deleted: true;
}> {
  const rootReal = await resolveRoot(workingDirectory);
  const { absolute, relative } = await resolveInsideRoot(
    rootReal,
    relativePath,
  );
  if (absolute === rootReal || relative === "") {
    throw new ProjectFsError(
      "Cannot delete the project working directory",
      "fs_path_outside_root",
    );
  }
  const info = await stat(absolute);
  const kind: ProjectFsEntryKind = info.isDirectory()
    ? "directory"
    : info.isFile()
      ? "file"
      : (() => {
          throw new ProjectFsError(
            "Path is not a file or folder",
            "fs_not_found",
            400,
          );
        })();

  await rm(absolute, { recursive: kind === "directory", force: false });
  return {
    path: relative,
    name: path.basename(absolute),
    kind,
    deleted: true,
  };
}
