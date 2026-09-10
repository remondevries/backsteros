import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export function resolveSshAuthSock(): string | undefined {
  const fromEnv = process.env.SSH_AUTH_SOCK?.trim();
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;

  const onePassword = path.join(
    os.homedir(),
    "Library/Group Containers/2BUA8C4S2C.com.1password/t/agent.sock",
  );
  if (fs.existsSync(onePassword)) return onePassword;
  return fromEnv || undefined;
}

function sshEnv(): NodeJS.ProcessEnv {
  const authSock = resolveSshAuthSock();
  return {
    ...process.env,
    ...(authSock ? { SSH_AUTH_SOCK: authSock } : {}),
  };
}

/**
 * Collapse noisy `Command failed: ssh … <<'PY'…` dumps into a short actionable line.
 */
export function sanitizeSshError(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "SSH command failed";
  let message = raw.replace(/^Command failed:\s*/u, "").trim();

  if (/Error connecting to agent|Connection refused/iu.test(message)) {
    return "1Password SSH agent is not available — open & unlock 1Password, enable the SSH agent, then retry";
  }
  if (/Permission denied \(publickey\)/iu.test(message)) {
    return "SSH permission denied (publickey) — unlock 1Password SSH agent (Hetzner key) and retry";
  }
  if (/Load key .*invalid format/iu.test(message) && /Permission denied/iu.test(message)) {
    return "SSH permission denied (publickey) — unlock 1Password SSH agent (Hetzner key) and retry";
  }
  if (/Timed out|ETIMEDOUT|ECONNREFUSED|Could not resolve/iu.test(message)) {
    const hit = message.match(/Timed out|ETIMEDOUT|ECONNREFUSED|Could not resolve[^\n]*/iu)?.[0];
    return hit ? `SSH ${hit}` : "SSH connection failed";
  }

  // Drop remote heredoc / multi-line script bodies from execFile errors.
  const heredocIdx = message.search(/python3\s+-<<|<<['"]?PY/u);
  if (heredocIdx !== -1) {
    message = message.slice(0, heredocIdx).trim();
  }
  const firstLine = message.split("\n").find((line) => line.trim()) ?? message;
  const cleaned = firstLine
    .replace(/\s+-o\s+\S+/gu, "")
    .replace(/\s{2,}/gu, " ")
    .trim();
  if (cleaned.length > 220) return `${cleaned.slice(0, 217)}…`;
  return cleaned || "SSH command failed";
}

export type SshConnectionResult = {
  readonly connected: boolean;
  readonly error?: string;
};

export async function checkSshConnection(ip: string): Promise<SshConnectionResult> {
  try {
    await execFileAsync(
      "ssh",
      [
        "-o",
        "BatchMode=yes",
        "-o",
        "ConnectTimeout=8",
        "-o",
        "StrictHostKeyChecking=accept-new",
        `root@${ip}`,
        "echo ok",
      ],
      {
        env: sshEnv(),
        timeout: 12_000,
        maxBuffer: 64 * 1024,
      },
    );
    return { connected: true };
  } catch (error) {
    return { connected: false, error: sanitizeSshError(error) };
  }
}

export async function sshExec(
  ip: string,
  remoteCommand: string,
  options?: { readonly timeoutMs?: number; readonly maxBuffer?: number },
): Promise<string> {
  try {
    const { stdout } = await execFileAsync(
      "ssh",
      [
        "-o",
        "BatchMode=yes",
        "-o",
        "ConnectTimeout=8",
        "-o",
        "StrictHostKeyChecking=accept-new",
        `root@${ip}`,
        remoteCommand,
      ],
      {
        env: sshEnv(),
        timeout: options?.timeoutMs ?? 25_000,
        maxBuffer: options?.maxBuffer ?? 4 * 1024 * 1024,
      },
    );
    return stdout.trim();
  } catch (error) {
    throw new Error(sanitizeSshError(error));
  }
}
