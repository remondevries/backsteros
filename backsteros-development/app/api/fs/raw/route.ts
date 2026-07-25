import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

import { mimeTypeForFilePath } from "@/lib/fs-file-preview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 8_000_000;

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

function isPathInsideRoot(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

/**
 * Serve raw file bytes (images / SVG) from a project working directory.
 * Query: `root` (cwd) + `path` (absolute file path inside root).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const rootInput = url.searchParams.get("root")?.trim() ?? "";
  const fileInput = url.searchParams.get("path")?.trim() ?? "";

  const root = await resolveExistingDirectory(rootInput);
  if (!root) {
    return NextResponse.json(
      { error: "A valid absolute working directory is required." },
      { status: 400 },
    );
  }

  if (!fileInput || !path.isAbsolute(fileInput)) {
    return NextResponse.json(
      { error: "An absolute file path is required." },
      { status: 400 },
    );
  }

  const filePath = path.resolve(fileInput);
  if (!isPathInsideRoot(root, filePath)) {
    return NextResponse.json(
      { error: "File is outside the project working directory." },
      { status: 403 },
    );
  }

  const contentType = mimeTypeForFilePath(filePath);
  if (!contentType) {
    return NextResponse.json(
      { error: "Only image files can be served as raw content." },
      { status: 415 },
    );
  }

  let stats;
  try {
    stats = await fs.stat(filePath);
  } catch {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }

  if (!stats.isFile()) {
    return NextResponse.json(
      { error: "Path is not a file." },
      { status: 400 },
    );
  }

  if (stats.size > MAX_BYTES) {
    return NextResponse.json(
      {
        error: `File is too large to preview (max ${Math.round(MAX_BYTES / 1024 / 1024)} MB).`,
      },
      { status: 413 },
    );
  }

  try {
    const buffer = await fs.readFile(filePath);
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(buffer.byteLength),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not read file.",
      },
      { status: 403 },
    );
  }
}
