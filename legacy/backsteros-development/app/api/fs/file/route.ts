import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 1_500_000;

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

function looksBinary(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, Math.min(buffer.length, 8_000));
  if (sample.includes(0)) return true;
  let suspicious = 0;
  for (const byte of sample) {
    if (byte < 7 || (byte > 13 && byte < 32)) suspicious += 1;
  }
  return suspicious / sample.length > 0.3;
}

type ResolvedFile =
  | { ok: true; root: string; filePath: string }
  | { ok: false; response: NextResponse };

async function resolveFileRequest(
  rootInput: string,
  fileInput: string,
): Promise<ResolvedFile> {
  const root = await resolveExistingDirectory(rootInput);
  if (!root) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "A valid absolute working directory is required." },
        { status: 400 },
      ),
    };
  }

  if (!fileInput || !path.isAbsolute(fileInput)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "An absolute file path is required." },
        { status: 400 },
      ),
    };
  }

  const filePath = path.resolve(fileInput);
  if (!isPathInsideRoot(root, filePath)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "File is outside the project working directory." },
        { status: 403 },
      ),
    };
  }

  return { ok: true, root, filePath };
}

/**
 * Read a text file under a project working directory.
 * Query: `root` (cwd) + `path` (absolute file path inside root).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const resolved = await resolveFileRequest(
    url.searchParams.get("root")?.trim() ?? "",
    url.searchParams.get("path")?.trim() ?? "",
  );
  if (!resolved.ok) return resolved.response;
  const { filePath } = resolved;

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
        error: `File is too large to open (max ${Math.round(MAX_BYTES / 1024)} KB).`,
        path: filePath,
        name: path.basename(filePath),
        size: stats.size,
        binary: false,
        content: null,
      },
      { status: 413 },
    );
  }

  try {
    const buffer = await fs.readFile(filePath);
    if (looksBinary(buffer)) {
      return NextResponse.json({
        path: filePath,
        name: path.basename(filePath),
        size: stats.size,
        binary: true,
        content: null,
      });
    }
    return NextResponse.json({
      path: filePath,
      name: path.basename(filePath),
      size: stats.size,
      binary: false,
      content: buffer.toString("utf8"),
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

/**
 * Write a text file under a project working directory.
 * Body JSON: `{ root, path, content }`.
 */
export async function PUT(request: Request) {
  let body: { root?: unknown; path?: unknown; content?: unknown };
  try {
    body = (await request.json()) as {
      root?: unknown;
      path?: unknown;
      content?: unknown;
    };
  } catch {
    return NextResponse.json(
      { error: "Expected JSON body with root, path, and content." },
      { status: 400 },
    );
  }

  const rootInput = typeof body.root === "string" ? body.root.trim() : "";
  const fileInput = typeof body.path === "string" ? body.path.trim() : "";
  if (typeof body.content !== "string") {
    return NextResponse.json(
      { error: "Content must be a string." },
      { status: 400 },
    );
  }
  const content = body.content;

  const byteLength = Buffer.byteLength(content, "utf8");
  if (byteLength > MAX_BYTES) {
    return NextResponse.json(
      {
        error: `File is too large to save (max ${Math.round(MAX_BYTES / 1024)} KB).`,
      },
      { status: 413 },
    );
  }

  const resolved = await resolveFileRequest(rootInput, fileInput);
  if (!resolved.ok) return resolved.response;
  const { filePath } = resolved;

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

  try {
    const existing = await fs.readFile(filePath);
    if (looksBinary(existing)) {
      return NextResponse.json(
        { error: "Binary files cannot be edited in the console." },
        { status: 415 },
      );
    }
    await fs.writeFile(filePath, content, "utf8");
    return NextResponse.json({
      path: filePath,
      name: path.basename(filePath),
      size: byteLength,
      binary: false,
      content,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not write file.",
      },
      { status: 403 },
    );
  }
}

/**
 * Delete a file or folder under a project working directory.
 * Query: `root` (cwd) + `path` (absolute path inside root).
 * Folders are removed recursively.
 */
export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const resolved = await resolveFileRequest(
    url.searchParams.get("root")?.trim() ?? "",
    url.searchParams.get("path")?.trim() ?? "",
  );
  if (!resolved.ok) return resolved.response;
  const { root, filePath } = resolved;

  let stats;
  try {
    stats = await fs.stat(filePath);
  } catch {
    return NextResponse.json({ error: "Path not found." }, { status: 404 });
  }

  if (filePath === root) {
    return NextResponse.json(
      { error: "Cannot delete the project working directory." },
      { status: 400 },
    );
  }

  const kind = stats.isDirectory()
    ? "directory"
    : stats.isFile()
      ? "file"
      : null;
  if (!kind) {
    return NextResponse.json(
      { error: "Path is not a file or folder." },
      { status: 400 },
    );
  }

  try {
    if (kind === "directory") {
      await fs.rm(filePath, { recursive: true, force: true });
    } else {
      await fs.unlink(filePath);
    }
    return NextResponse.json({
      path: filePath,
      name: path.basename(filePath),
      kind,
      deleted: true,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : `Could not delete ${kind}.`,
      },
      { status: 403 },
    );
  }
}
