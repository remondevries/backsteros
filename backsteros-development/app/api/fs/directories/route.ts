import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DirectoryEntry = {
  name: string;
  path: string;
};

async function resolveExistingDirectory(input: string): Promise<string | null> {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const resolved = path.resolve(trimmed);
  try {
    const stats = await fs.stat(resolved);
    if (!stats.isDirectory()) return null;
    return resolved;
  } catch {
    return null;
  }
}

async function listChildDirectories(
  directory: string,
): Promise<DirectoryEntry[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const directories: DirectoryEntry[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    // Skip dot directories for a cleaner Finder-like browse (still navigable via path).
    if (entry.name.startsWith(".")) continue;
    const childPath = path.join(directory, entry.name);
    try {
      const stats = await fs.stat(childPath);
      if (!stats.isDirectory()) continue;
      directories.push({ name: entry.name, path: childPath });
    } catch {
      // Unreadable / broken symlink — skip.
    }
  }
  directories.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
  return directories;
}

/**
 * Local filesystem directory browser for the development console.
 * Lists child folders at `?path=` (defaults to home).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const requested =
    url.searchParams.get("path")?.trim() || os.homedir();
  const home = os.homedir();

  let current =
    (await resolveExistingDirectory(requested)) ??
    (await resolveExistingDirectory(path.dirname(requested))) ??
    (await resolveExistingDirectory(home)) ??
    home;

  let entries: DirectoryEntry[] = [];
  try {
    entries = await listChildDirectories(current);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not read directory.",
        path: current,
        parent: path.dirname(current) === current ? null : path.dirname(current),
        home,
        entries: [],
      },
      { status: 403 },
    );
  }

  const parentPath = path.dirname(current);
  const parent = parentPath === current ? null : parentPath;

  return NextResponse.json({
    path: current,
    parent,
    home,
    entries,
  });
}
