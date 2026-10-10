/**
 * One-time clone of a codebase project onto the development server (OS-106).
 *
 * Uses `ssh -A <host>` (default host alias `development`, user `deploy`) so
 * the Mac's GitHub SSH agent can authenticate. Never logs tokens or URLs with
 * embedded credentials. Idempotent: existing checkouts are left untouched.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type DevelopmentCheckoutInput = {
  readonly githubRepository: string | null | undefined;
  readonly developmentLocation: string | null | undefined;
};

export type DevelopmentCheckoutResult =
  | { readonly status: "ready"; readonly skippedExisting: boolean }
  | { readonly status: "failed"; readonly error: string }
  | { readonly status: "skipped"; readonly reason: string };

export type DevelopmentCheckoutDeps = {
  readonly sshHost?: string;
  readonly exec?: (
    file: string,
    args: readonly string[],
    options?: { readonly timeout?: number; readonly env?: NodeJS.ProcessEnv },
  ) => Promise<{ readonly stdout: string; readonly stderr: string }>;
};

const DEFAULT_SSH_HOST = "development";
const SSH_TIMEOUT_MS = 120_000;

/** Strip credentials / home paths from error text before storing on the project. */
export function sanitizeCheckoutError(message: string): string {
  let out = message.replace(/\r/g, "").trim();
  out = out.replace(/ghp_[A-Za-z0-9_]+/g, "[redacted]");
  out = out.replace(/gho_[A-Za-z0-9_]+/g, "[redacted]");
  out = out.replace(/github_pat_[A-Za-z0-9_]+/g, "[redacted]");
  out = out.replace(
    /https?:\/\/[^:@\s]+:[^@\s]+@/gi,
    "https://[redacted]@",
  );
  out = out.replace(/x-access-token:[^@\s]+@/gi, "x-access-token:[redacted]@");
  const firstLine = out.split("\n")[0]?.trim() || "development checkout failed";
  return firstLine.slice(0, 500);
}

export function githubSshCloneUrl(githubRepository: string): string | null {
  const trimmed = githubRepository.trim();
  if (!/^[^/\s]+\/[^/\s]+$/.test(trimmed)) return null;
  return `git@github.com:${trimmed}.git`;
}

function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * Remote script: if PATH already has a git checkout, exit 0 with "EXISTS".
 * Otherwise mkdir -p parent and git clone. Never overwrites an existing tree.
 */
export function buildRemoteCloneScript(input: {
  readonly location: string;
  readonly cloneUrl: string;
}): string {
  const location = shellSingleQuote(input.location);
  const cloneUrl = shellSingleQuote(input.cloneUrl);
  return [
    "set -euo pipefail",
    `LOCATION=${location}`,
    `CLONE_URL=${cloneUrl}`,
    'if [ -d "$LOCATION/.git" ]; then echo EXISTS; exit 0; fi',
    'if [ -e "$LOCATION" ]; then echo "path exists but is not a git checkout" >&2; exit 3; fi',
    'mkdir -p "$(dirname "$LOCATION")"',
    'git clone -- "$CLONE_URL" "$LOCATION"',
    "echo CLONED",
  ].join("\n");
}

export async function ensureDevelopmentCheckout(
  input: DevelopmentCheckoutInput,
  deps: DevelopmentCheckoutDeps = {},
): Promise<DevelopmentCheckoutResult> {
  const location = input.developmentLocation?.trim() ?? "";
  const repo = input.githubRepository?.trim() ?? "";
  if (!location) {
    return { status: "skipped", reason: "developmentLocation unset" };
  }
  if (!location.startsWith("/")) {
    return {
      status: "failed",
      error: sanitizeCheckoutError("developmentLocation must be an absolute path"),
    };
  }
  if (!repo) {
    return {
      status: "failed",
      error: sanitizeCheckoutError(
        "githubRepository is required to clone onto the development server",
      ),
    };
  }
  const cloneUrl = githubSshCloneUrl(repo);
  if (!cloneUrl) {
    return {
      status: "failed",
      error: sanitizeCheckoutError("githubRepository must be owner/repo"),
    };
  }

  const sshHost =
    deps.sshHost?.trim() ||
    process.env.BACKSTEROS_DEVELOPMENT_SSH_HOST?.trim() ||
    DEFAULT_SSH_HOST;
  const exec =
    deps.exec ??
    (async (file, args, options) => {
      const result = await execFileAsync(file, [...args], {
        timeout: options?.timeout,
        env: options?.env,
        maxBuffer: 2 * 1024 * 1024,
      });
      return {
        stdout: String(result.stdout ?? ""),
        stderr: String(result.stderr ?? ""),
      };
    });

  const remoteScript = buildRemoteCloneScript({ location, cloneUrl });
  try {
    const { stdout } = await exec(
      "ssh",
      [
        "-A",
        "-o",
        "BatchMode=yes",
        "-o",
        "StrictHostKeyChecking=accept-new",
        "-o",
        "ConnectTimeout=15",
        sshHost,
        `bash -lc ${shellSingleQuote(remoteScript)}`,
      ],
      {
        timeout: SSH_TIMEOUT_MS,
        env: process.env,
      },
    );
    const marker = stdout.trim().split("\n").pop()?.trim() ?? "";
    if (marker === "EXISTS") {
      return { status: "ready", skippedExisting: true };
    }
    return { status: "ready", skippedExisting: false };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : "development checkout failed";
    const stderr =
      error &&
      typeof error === "object" &&
      "stderr" in error &&
      typeof (error as { stderr?: unknown }).stderr === "string"
        ? (error as { stderr: string }).stderr
        : "";
    return {
      status: "failed",
      error: sanitizeCheckoutError(stderr.trim() || message),
    };
  }
}
