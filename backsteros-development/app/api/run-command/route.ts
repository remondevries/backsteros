import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_COMMAND_LENGTH = 8_192;

type RunCommandBody = {
  command?: unknown;
  cwd?: unknown;
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

/**
 * Start a shell command in a project working directory (detached).
 * Local development console only — same trust model as /api/fs/directories.
 */
export async function POST(request: Request) {
  let body: RunCommandBody;
  try {
    body = (await request.json()) as RunCommandBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const command =
    typeof body.command === "string" ? body.command.trim() : "";
  if (!command) {
    return NextResponse.json(
      { error: "Command is required." },
      { status: 400 },
    );
  }
  if (command.length > MAX_COMMAND_LENGTH) {
    return NextResponse.json(
      { error: "Command is too long." },
      { status: 400 },
    );
  }

  const cwdInput = typeof body.cwd === "string" ? body.cwd : "";
  const cwd = await resolveExistingDirectory(cwdInput);
  if (!cwd) {
    return NextResponse.json(
      { error: "A valid absolute working directory is required." },
      { status: 400 },
    );
  }

  const shell =
    process.env.PTY_SHELL ??
    process.env.SHELL ??
    (process.platform === "win32" ? "powershell.exe" : "/bin/zsh");
  const shellArgs =
    process.platform === "win32" ? ["-Command", command] : ["-lc", command];

  try {
    const child = spawn(shell, shellArgs, {
      cwd,
      env: process.env,
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });

    const earlyError = await new Promise<Error | null>((resolve) => {
      const onError = (error: Error) => {
        cleanup();
        resolve(error);
      };
      const onSpawn = () => {
        cleanup();
        resolve(null);
      };
      const timer = setTimeout(() => {
        cleanup();
        resolve(null);
      }, 250);

      function cleanup() {
        clearTimeout(timer);
        child.off("error", onError);
        child.off("spawn", onSpawn);
      }

      child.once("error", onError);
      child.once("spawn", onSpawn);
    });

    if (earlyError) {
      return NextResponse.json(
        { error: earlyError.message },
        { status: 500 },
      );
    }

    child.unref();

    return NextResponse.json({
      ok: true,
      pid: child.pid ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to run command.",
      },
      { status: 500 },
    );
  }
}
