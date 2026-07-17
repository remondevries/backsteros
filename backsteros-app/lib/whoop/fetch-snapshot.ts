import { execFile, type ExecException } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

import type { WhoopSnapshotEntity } from "@/lib/whoop/types";

const execFileAsync = promisify(execFile);

type CliResult =
  | { ok: true; snapshot: WhoopSnapshotEntity | null }
  | { ok: false; snapshot: null; error: string };

function parseCliStdout(stdout: string): string | null {
  const lines = stdout.trim().split("\n").filter(Boolean);
  const lastLine = lines.at(-1);
  if (!lastLine) {
    return null;
  }

  try {
    const parsed = JSON.parse(lastLine) as CliResult;
    if (!parsed.ok && parsed.error) {
      return parsed.error;
    }
  } catch {
    return null;
  }

  return null;
}

function resolveWhoopFetchError(error: unknown): Error {
  if (error && typeof error === "object") {
    const execError = error as ExecException & { stdout?: string; stderr?: string };
    const cliMessage = execError.stdout ? parseCliStdout(execError.stdout) : null;
    if (cliMessage) {
      return new Error(cliMessage);
    }
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error("Failed to load Whoop data");
}

/**
 * Fetches WHOOP data in a separate Node process so Next/Turbopack never bundles
 * @briangaoo/totem (dynamic dist imports are not resolvable in the app bundle).
 */
function buildWhoopCliArgs(
  options: {
    timezone?: string;
    now?: Date;
    includeStrainDeepDive?: boolean;
    date?: string;
  },
): string[] {
  const args: string[] = [];

  if (options.date) {
    args.push("--date", options.date);
  }
  if (options.timezone) {
    args.push("--timezone", options.timezone);
  }
  if (options.now) {
    args.push("--now", options.now.toISOString());
  }
  if (options.includeStrainDeepDive) {
    args.push("--strain-deep-dive");
  }

  return args;
}

function resolveWhoopCliInvocation(
  options: {
    timezone?: string;
    now?: Date;
    includeStrainDeepDive?: boolean;
    date?: string;
  },
): { command: string; args: string[] } {
  const cliArgs = buildWhoopCliArgs(options);
  const scriptPath = join(process.cwd(), "scripts", "whoop-fetch-cli.ts");
  const tsxBin = join(process.cwd(), "node_modules", ".bin", "tsx");

  if (existsSync(tsxBin) && existsSync(scriptPath)) {
    return {
      command: tsxBin,
      args: [scriptPath, ...cliArgs],
    };
  }

  return {
    command: "npx",
    args: ["tsx", scriptPath, ...cliArgs],
  };
}

export async function fetchWhoopDaySnapshot(
  options: {
    timezone?: string;
    now?: Date;
    includeStrainDeepDive?: boolean;
    date?: string;
  } = {},
): Promise<WhoopSnapshotEntity | null> {
  const { command, args } = resolveWhoopCliInvocation(options);

  try {
    const { stdout } = await execFileAsync(command, args, {
      cwd: process.cwd(),
      env: process.env,
      maxBuffer: 16 * 1024 * 1024,
      timeout: 120_000,
    });

    const parsed = JSON.parse(stdout.trim()) as CliResult;

    if (!parsed.ok) {
      throw new Error(parsed.error ?? "Whoop fetch failed");
    }

    return parsed.snapshot;
  } catch (error) {
    throw resolveWhoopFetchError(error);
  }
}
