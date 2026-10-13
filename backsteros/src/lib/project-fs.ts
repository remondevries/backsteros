/**
 * Tauri-backed filesystem adapter for codebase project workbench.
 * Mirrors legacy Next `/api/fs/{directories,entries,file,raw}` shapes.
 */
import { join } from "@tauri-apps/api/path";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  exists,
  mkdir,
  readDir,
  readFile,
  readTextFile,
  remove,
  stat,
  writeTextFile,
} from "@tauri-apps/plugin-fs";

export type FsTreeEntry = {
  name: string;
  path: string;
  kind: "file" | "directory";
};

export type ProjectFsClient = {
  listEntries: (path: string) => Promise<{
    path: string;
    entries: FsTreeEntry[];
    error?: string;
  }>;
  createEntry: (args: {
    root: string;
    parent: string;
    name: string;
    kind: "file" | "directory";
  }) => Promise<{
    path: string;
    name: string;
    kind: "file" | "directory";
    parent: string;
  }>;
  readFile: (
    root: string,
    path: string,
  ) => Promise<{
    path: string;
    name: string;
    size: number;
    binary: boolean;
    content: string | null;
    error?: string;
  }>;
  writeFile: (
    root: string,
    path: string,
    content: string,
  ) => Promise<{
    path: string;
    name: string;
    size: number;
    binary: boolean;
    content: string;
  }>;
  deleteEntry: (
    root: string,
    path: string,
  ) => Promise<{
    path: string;
    name: string;
    kind: "file" | "directory";
    deleted: boolean;
  }>;
  pickDirectory: (defaultPath?: string) => Promise<string | null>;
  readRawUrl: (root: string, path: string) => Promise<string | null>;
};

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

const MAX_TEXT_BYTES = 1_500_000;
const MAX_RAW_BYTES = 8_000_000;

const IMAGE_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".bmp": "image/bmp",
};

function basename(filePath: string): string {
  const parts = filePath.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || filePath;
}

function extname(filePath: string): string {
  const name = basename(filePath);
  const idx = name.lastIndexOf(".");
  if (idx <= 0) return "";
  return name.slice(idx).toLowerCase();
}

function isAbsolutePath(input: string): boolean {
  return input.startsWith("/") || /^[A-Za-z]:[\\/]/.test(input);
}

function isPathInsideRoot(root: string, candidate: string): boolean {
  const rootNorm = root.replace(/\\/g, "/").replace(/\/+$/, "");
  const candNorm = candidate.replace(/\\/g, "/");
  return candNorm === rootNorm || candNorm.startsWith(`${rootNorm}/`);
}

function isValidEntryName(name: string): boolean {
  if (!name || name === "." || name === "..") return false;
  if (name.includes("/") || name.includes("\\") || name.includes("\0")) {
    return false;
  }
  return true;
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

async function resolveExistingDirectory(
  input: string,
): Promise<string | null> {
  const trimmed = input.trim();
  if (!trimmed || !isAbsolutePath(trimmed)) return null;
  try {
    if (!(await exists(trimmed))) return null;
    const info = await stat(trimmed);
    if (!info.isDirectory) return null;
    return trimmed;
  } catch {
    return null;
  }
}

async function assertInsideRoot(
  rootInput: string,
  fileInput: string,
): Promise<{ root: string; filePath: string }> {
  const root = await resolveExistingDirectory(rootInput);
  if (!root) {
    throw new Error("A valid absolute working directory is required.");
  }
  if (!fileInput || !isAbsolutePath(fileInput)) {
    throw new Error("An absolute file path is required.");
  }
  const filePath = fileInput;
  if (!isPathInsideRoot(root, filePath)) {
    throw new Error("Path is outside the project working directory.");
  }
  return { root, filePath };
}

export const projectFs: ProjectFsClient = {
  async listEntries(requested) {
    const current = await resolveExistingDirectory(requested);
    if (!current) {
      return {
        path: requested,
        entries: [],
        error: "A valid absolute directory path is required.",
      };
    }
    try {
      const dirEntries = await readDir(current);
      const result: FsTreeEntry[] = [];
      for (const entry of dirEntries) {
        if (!entry.name || SKIP_NAMES.has(entry.name)) continue;
        if (entry.name.startsWith(".")) continue;
        const childPath = await join(current, entry.name);
        try {
          const info = await stat(childPath);
          if (info.isDirectory) {
            result.push({
              name: entry.name,
              path: childPath,
              kind: "directory",
            });
          } else if (info.isFile) {
            result.push({ name: entry.name, path: childPath, kind: "file" });
          }
        } catch {
          // skip
        }
      }
      result.sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      });
      return { path: current, entries: result };
    } catch (error) {
      return {
        path: current,
        entries: [],
        error:
          error instanceof Error ? error.message : "Could not read directory.",
      };
    }
  },

  async createEntry({ root: rootInput, parent: parentInput, name, kind }) {
    if (!isValidEntryName(name)) {
      throw new Error("A valid file or folder name is required.");
    }
    const root = await resolveExistingDirectory(rootInput);
    if (!root) {
      throw new Error("A valid absolute working directory is required.");
    }
    const parent = await resolveExistingDirectory(parentInput || root);
    if (!parent) {
      throw new Error("Parent directory was not found.");
    }
    if (!isPathInsideRoot(root, parent)) {
      throw new Error("Parent is outside the project working directory.");
    }
    const targetPath = await join(parent, name);
    if (!isPathInsideRoot(root, targetPath)) {
      throw new Error("Path is outside the project working directory.");
    }
    if (await exists(targetPath)) {
      throw new Error("A file or folder with that name already exists.");
    }
    if (kind === "directory") {
      await mkdir(targetPath);
    } else {
      await writeTextFile(targetPath, "");
    }
    return { path: targetPath, name, kind, parent };
  },

  async readFile(rootInput, fileInput) {
    let root: string;
    let filePath: string;
    try {
      ({ root, filePath } = await assertInsideRoot(rootInput, fileInput));
    } catch (error) {
      return {
        path: fileInput,
        name: basename(fileInput),
        size: 0,
        binary: false,
        content: null,
        error: error instanceof Error ? error.message : "Invalid path.",
      };
    }
    void root;

    try {
      const info = await stat(filePath);
      if (!info.isFile) {
        return {
          path: filePath,
          name: basename(filePath),
          size: 0,
          binary: false,
          content: null,
          error: "Path is not a file.",
        };
      }
      const size = Number(info.size ?? 0);
      if (size > MAX_TEXT_BYTES) {
        return {
          path: filePath,
          name: basename(filePath),
          size,
          binary: false,
          content: null,
          error: `File is too large to open (max ${Math.round(MAX_TEXT_BYTES / 1024)} KB).`,
        };
      }
      const bytes = await readFile(filePath);
      if (looksBinary(bytes)) {
        return {
          path: filePath,
          name: basename(filePath),
          size,
          binary: true,
          content: null,
        };
      }
      const content = await readTextFile(filePath);
      return {
        path: filePath,
        name: basename(filePath),
        size,
        binary: false,
        content,
      };
    } catch (error) {
      return {
        path: filePath,
        name: basename(filePath),
        size: 0,
        binary: false,
        content: null,
        error: error instanceof Error ? error.message : "Could not read file.",
      };
    }
  },

  async writeFile(rootInput, fileInput, content) {
    const byteLength = new TextEncoder().encode(content).byteLength;
    if (byteLength > MAX_TEXT_BYTES) {
      throw new Error(
        `File is too large to save (max ${Math.round(MAX_TEXT_BYTES / 1024)} KB).`,
      );
    }
    const { filePath } = await assertInsideRoot(rootInput, fileInput);
    const info = await stat(filePath);
    if (!info.isFile) {
      throw new Error("Path is not a file.");
    }
    const existing = await readFile(filePath);
    if (looksBinary(existing)) {
      throw new Error("Binary files cannot be edited.");
    }
    await writeTextFile(filePath, content);
    return {
      path: filePath,
      name: basename(filePath),
      size: byteLength,
      binary: false,
      content,
    };
  },

  async deleteEntry(rootInput, fileInput) {
    const { root, filePath } = await assertInsideRoot(rootInput, fileInput);
    if (filePath === root) {
      throw new Error("Cannot delete the project working directory.");
    }
    const info = await stat(filePath);
    const kind = info.isDirectory
      ? "directory"
      : info.isFile
        ? "file"
        : null;
    if (!kind) {
      throw new Error("Path is not a file or folder.");
    }
    if (kind === "directory") {
      await remove(filePath, { recursive: true });
    } else {
      await remove(filePath);
    }
    return {
      path: filePath,
      name: basename(filePath),
      kind,
      deleted: true,
    };
  },

  async pickDirectory(defaultPath) {
    const selected = await openDialog({
      directory: true,
      multiple: false,
      defaultPath: defaultPath?.trim() || undefined,
      title: "Choose project working directory",
    });
    if (typeof selected !== "string" || !selected.trim()) return null;
    return selected.trim();
  },

  async readRawUrl(rootInput, fileInput) {
    try {
      const { filePath } = await assertInsideRoot(rootInput, fileInput);
      const mime = IMAGE_MIME[extname(filePath)];
      if (!mime) return null;
      const info = await stat(filePath);
      if (!info.isFile) return null;
      const size = Number(info.size ?? 0);
      if (size > MAX_RAW_BYTES) return null;
      const bytes = await readFile(filePath);
      const blob = new Blob([bytes], { type: mime });
      return URL.createObjectURL(blob);
    } catch {
      return null;
    }
  },
};
