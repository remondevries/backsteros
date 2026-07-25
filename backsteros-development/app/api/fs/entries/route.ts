import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

export type FsTreeEntry = {
  name: string;
  path: string;
  kind: "file" | "directory";
};

async function resolveExistingDirectory(input: string): Promise<string | null> {
  const trimmed = input.trim();
  if (!trimmed || !path.isAbsolute(trimmed)) return null;
  try {
    const stats = await fs.stat(trimmed);
    if (!stats.isDirectory()) return null;
    return trimmed;
  } catch {
    return null;
  }
}

async function listEntries(directory: string): Promise<FsTreeEntry[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const result: FsTreeEntry[] = [];
  for (const entry of entries) {
    if (SKIP_NAMES.has(entry.name)) continue;
    if (entry.name.startsWith(".")) continue;
    const childPath = path.join(directory, entry.name);
    try {
      const stats = await fs.stat(childPath);
      if (stats.isDirectory()) {
        result.push({ name: entry.name, path: childPath, kind: "directory" });
      } else if (stats.isFile()) {
        result.push({ name: entry.name, path: childPath, kind: "file" });
      }
    } catch {
      // Unreadable / broken symlink — skip.
    }
  }
  result.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
  return result;
}

/**
 * List files + folders at an absolute working-directory path.
 * Used by the console project Files tab (local tree).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const requested = url.searchParams.get("path")?.trim() ?? "";
  const current = await resolveExistingDirectory(requested);
  if (!current) {
    return NextResponse.json(
      {
        error: "A valid absolute directory path is required.",
        path: null,
        entries: [],
      },
      { status: 400 },
    );
  }

  try {
    const entries = await listEntries(current);
    return NextResponse.json({ path: current, entries });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not read directory.",
        path: current,
        entries: [],
      },
      { status: 403 },
    );
  }
}

function isPathInsideRoot(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

function isValidEntryName(name: string): boolean {
  if (!name || name === "." || name === "..") return false;
  if (name.includes("/") || name.includes("\\") || name.includes("\0")) {
    return false;
  }
  return true;
}

/**
 * Create a file or folder under a project working directory.
 * Body JSON: `{ root, parent, name, kind: "file" | "directory" }`.
 */
export async function POST(request: Request) {
  let body: {
    root?: unknown;
    parent?: unknown;
    name?: unknown;
    kind?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { error: "Expected JSON body with root, parent, name, and kind." },
      { status: 400 },
    );
  }

  const rootInput = typeof body.root === "string" ? body.root.trim() : "";
  const parentInput =
    typeof body.parent === "string" ? body.parent.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const kind = body.kind === "directory" ? "directory" : body.kind === "file" ? "file" : null;

  if (!kind) {
    return NextResponse.json(
      { error: 'Kind must be "file" or "directory".' },
      { status: 400 },
    );
  }
  if (!isValidEntryName(name)) {
    return NextResponse.json(
      { error: "A valid file or folder name is required." },
      { status: 400 },
    );
  }

  const root = await resolveExistingDirectory(rootInput);
  if (!root) {
    return NextResponse.json(
      { error: "A valid absolute working directory is required." },
      { status: 400 },
    );
  }

  const parent = await resolveExistingDirectory(parentInput || root);
  if (!parent) {
    return NextResponse.json(
      { error: "Parent directory was not found." },
      { status: 404 },
    );
  }
  if (!isPathInsideRoot(root, parent)) {
    return NextResponse.json(
      { error: "Parent is outside the project working directory." },
      { status: 403 },
    );
  }

  const targetPath = path.resolve(parent, name);
  if (!isPathInsideRoot(root, targetPath)) {
    return NextResponse.json(
      { error: "Path is outside the project working directory." },
      { status: 403 },
    );
  }

  try {
    await fs.stat(targetPath);
    return NextResponse.json(
      { error: "A file or folder with that name already exists." },
      { status: 409 },
    );
  } catch {
    // Does not exist — proceed.
  }

  try {
    if (kind === "directory") {
      await fs.mkdir(targetPath);
    } else {
      await fs.writeFile(targetPath, "", "utf8");
    }
    return NextResponse.json({
      path: targetPath,
      name,
      kind,
      parent,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : `Could not create ${kind}.`,
      },
      { status: 403 },
    );
  }
}
