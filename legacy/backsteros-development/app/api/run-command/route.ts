import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";

import { createAnsiStripper } from "@/lib/strip-ansi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_COMMAND_LENGTH = 8_192;
const MAX_TIMEOUT_MS = 30 * 60 * 1000;

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

function encodeEvent(
  encoder: TextEncoder,
  event: Record<string, unknown>,
): Uint8Array {
  return encoder.encode(`${JSON.stringify(event)}\n`);
}

/**
 * Login non-interactive shells (`zsh -lc`) skip ~/.zshrc, where nvm usually
 * lives. Preload nvm (and auto-select .nvmrc when present) so `nvm` / modern
 * `node` work the same as in an interactive terminal.
 */
function wrapUnixShellCommand(command: string): string {
  const home = os.homedir().replace(/'/g, `'\\''`);
  return [
    `export NVM_DIR="\${NVM_DIR:-${home}/.nvm}"`,
    // Homebrew nvm formula, then classic ~/.nvm install.
    `if [ -s /opt/homebrew/opt/nvm/nvm.sh ]; then`,
    `  . /opt/homebrew/opt/nvm/nvm.sh`,
    `elif [ -s "$NVM_DIR/nvm.sh" ]; then`,
    `  . "$NVM_DIR/nvm.sh"`,
    `elif [ -s "$HOME/.nvm/nvm.sh" ]; then`,
    `  . "$HOME/.nvm/nvm.sh"`,
    `fi`,
    // Honor project pin when the command doesn't already call nvm use.
    `if command -v nvm >/dev/null 2>&1; then`,
    `  if [ -f .nvmrc ] || [ -f .node-version ]; then`,
    `    nvm use >/dev/null 2>&1 || true`,
    `  fi`,
    `fi`,
    command,
  ].join("\n");
}

/**
 * Run a shell command and stream stdout/stderr as NDJSON until exit.
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
  const shellCommand =
    process.platform === "win32" ? command : wrapUnixShellCommand(command);
  const shellArgs =
    process.platform === "win32"
      ? ["-Command", shellCommand]
      : ["-lc", shellCommand];

  let child: ChildProcessWithoutNullStreams;
  try {
    child = spawn(shell, shellArgs, {
      cwd,
      env: {
        ...process.env,
        // Plain-text log panel — discourage color / fancy TTY sequences.
        TERM: "dumb",
        NO_COLOR: "1",
        FORCE_COLOR: "0",
        // Prefer UTF-8 so glyphs aren't replaced when tools probe the locale.
        LANG: process.env.LANG || "en_US.UTF-8",
        LC_ALL: process.env.LC_ALL || process.env.LANG || "en_US.UTF-8",
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to start command.",
      },
      { status: 500 },
    );
  }

  const encoder = new TextEncoder();
  // Stream-decode so multi-byte UTF-8 glyphs split across chunks don't become �.
  const stdoutDecoder = new TextDecoder("utf-8");
  const stderrDecoder = new TextDecoder("utf-8");
  const stdoutAnsi = createAnsiStripper();
  const stderrAnsi = createAnsiStripper();
  let closed = false;
  let timeout: ReturnType<typeof setTimeout> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const push = (event: Record<string, unknown>) => {
        if (closed) return;
        try {
          controller.enqueue(encodeEvent(encoder, event));
        } catch {
          /* stream already closed */
        }
      };

      const pushDecoded = (
        streamName: "stdout" | "stderr",
        raw: string,
        stripper: ReturnType<typeof createAnsiStripper>,
      ) => {
        const data = stripper.push(raw);
        if (data) push({ type: streamName, data });
      };

      const flushDecoders = () => {
        const stdoutTail = stdoutAnsi.push(stdoutDecoder.decode());
        const stdoutFlush = stdoutAnsi.flush();
        const stdoutData = `${stdoutTail}${stdoutFlush}`;
        if (stdoutData) push({ type: "stdout", data: stdoutData });

        const stderrTail = stderrAnsi.push(stderrDecoder.decode());
        const stderrFlush = stderrAnsi.flush();
        const stderrData = `${stderrTail}${stderrFlush}`;
        if (stderrData) push({ type: "stderr", data: stderrData });
      };

      const finish = (event?: Record<string, unknown>) => {
        if (closed) return;
        closed = true;
        if (timeout) {
          clearTimeout(timeout);
          timeout = null;
        }
        flushDecoders();
        if (event) push(event);
        try {
          controller.close();
        } catch {
          /* ignore */
        }
      };

      push({ type: "start", command, cwd, pid: child.pid ?? null });

      child.stdout.on("data", (chunk: Buffer | string) => {
        const data =
          typeof chunk === "string"
            ? chunk
            : stdoutDecoder.decode(chunk, { stream: true });
        if (data) pushDecoded("stdout", data, stdoutAnsi);
      });
      child.stderr.on("data", (chunk: Buffer | string) => {
        const data =
          typeof chunk === "string"
            ? chunk
            : stderrDecoder.decode(chunk, { stream: true });
        if (data) pushDecoded("stderr", data, stderrAnsi);
      });
      child.on("error", (error) => {
        finish({ type: "error", error: error.message });
      });
      child.on("close", (code, signal) => {
        finish({ type: "exit", code, signal });
      });

      timeout = setTimeout(() => {
        try {
          child.kill("SIGTERM");
        } catch {
          /* ignore */
        }
        finish({
          type: "error",
          error: `Command timed out after ${MAX_TIMEOUT_MS}ms.`,
        });
      }, MAX_TIMEOUT_MS);

      request.signal.addEventListener("abort", () => {
        try {
          child.kill("SIGTERM");
        } catch {
          /* ignore */
        }
        finish({ type: "exit", code: null, signal: "SIGTERM", aborted: true });
      });
    },
    cancel() {
      if (closed) return;
      closed = true;
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      try {
        child.kill("SIGTERM");
      } catch {
        /* ignore */
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
