// @effect-diagnostics nodeBuiltinImport:off globalFetch:off globalFetchInEffect:off globalDate:off preferSchemaOverJson:off globalTimers:off unknownInEffectCatch:off anyUnknownInErrorContext:off catchToOrElseSucceed:off
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Hetzner hosts use the deploy user over Tailscale (root publickey is denied). */
export const SSH_USER = "deploy";

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

  if (/Error connecting to agent/iu.test(message)) {
    return "1Password SSH agent is not available — open & unlock 1Password, enable the SSH agent, then retry";
  }
  if (/Permission denied \(publickey\)/iu.test(message)) {
    return "SSH permission denied (publickey) — unlock 1Password SSH agent (Hetzner key) and retry";
  }
  if (/Load key .*invalid format/iu.test(message) && /Permission denied/iu.test(message)) {
    return "SSH permission denied (publickey) — unlock 1Password SSH agent (Hetzner key) and retry";
  }
  if (/Connection refused/iu.test(message)) {
    return "SSH connection refused on Tailscale — is sshd listening on the tailnet (port 22)?";
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

type TailscalePeer = {
  readonly HostName?: string;
  readonly DNSName?: string;
  readonly TailscaleIPs?: readonly string[];
  readonly CurAddr?: string;
  readonly Online?: boolean;
};

type TailscaleStatus = {
  readonly Peer?: Record<string, TailscalePeer>;
  readonly Self?: TailscalePeer;
};

let tailscaleStatusCache: { readonly at: number; readonly status: TailscaleStatus | null } = {
  at: 0,
  status: null,
};

const TAILSCALE_STATUS_TTL_MS = 30_000;

function isTailscaleIpv4(ip: string): boolean {
  // Tailscale CGNAT range 100.64.0.0/10
  const parts = ip.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  const [a, b] = parts as [number, number, number, number];
  return a === 100 && b >= 64 && b <= 127;
}

function firstTailscaleIpv4(peer: TailscalePeer): string | null {
  for (const ip of peer.TailscaleIPs ?? []) {
    if (isTailscaleIpv4(ip)) return ip;
  }
  return null;
}

async function readTailscaleStatus(): Promise<TailscaleStatus | null> {
  const now = Date.now();
  if (now - tailscaleStatusCache.at < TAILSCALE_STATUS_TTL_MS) {
    return tailscaleStatusCache.status;
  }
  try {
    const { stdout } = await execFileAsync("tailscale", ["status", "--json"], {
      timeout: 5_000,
      maxBuffer: 2 * 1024 * 1024,
    });
    const status = JSON.parse(stdout) as TailscaleStatus;
    tailscaleStatusCache = { at: now, status };
    return status;
  } catch {
    tailscaleStatusCache = { at: now, status: null };
    return null;
  }
}

function peerMatchesHint(peer: TailscalePeer, hint: string): boolean {
  const normalized = hint.trim().toLowerCase();
  if (!normalized) return false;
  const hostName = peer.HostName?.trim().toLowerCase() ?? "";
  const dnsName = peer.DNSName?.trim().toLowerCase().replace(/\.$/u, "") ?? "";
  if (hostName === normalized) return true;
  if (dnsName === normalized || dnsName.startsWith(`${normalized}.`)) return true;
  // Public WAN endpoint captured in CurAddr ("46.x.x.x:41641") while SSH on
  // that address is closed — match so we can dial the Tailscale IP instead.
  if (peer.CurAddr?.startsWith(`${hint.trim()}:`)) return true;
  return false;
}

/**
 * Prefer a Tailscale IPv4 (or MagicDNS short name) for SSH. Public Hetzner
 * SSH is shut; hosts are reached on the tailnet as `deploy@…`.
 */
export async function resolveSshHost(
  hostOrName: string,
  options?: { readonly alsoTry?: string | null },
): Promise<string> {
  const primary = hostOrName.trim();
  if (!primary) {
    const fallback = options?.alsoTry?.trim();
    return fallback && fallback.length > 0 ? fallback : primary;
  }
  if (isTailscaleIpv4(primary)) return primary;

  const status = await readTailscaleStatus();
  const peers = [
    ...(status?.Self ? [status.Self] : []),
    ...Object.values(status?.Peer ?? {}),
  ];
  const hints = [primary, options?.alsoTry?.trim() ?? ""].filter((hint) => hint.length > 0);
  for (const hint of hints) {
    const peer = peers.find((entry) => peerMatchesHint(entry, hint));
    const tailscaleIp = peer ? firstTailscaleIpv4(peer) : null;
    if (tailscaleIp) return tailscaleIp;
  }

  // Fall back to the Hetzner server name so ~/.ssh/config Host aliases can
  // remap to Tailscale when status lookup is unavailable.
  return primary;
}

/** Clear the Tailscale status cache (tests). */
export function clearTailscaleStatusCache(): void {
  tailscaleStatusCache = { at: 0, status: null };
}

/** Resolve SSH host for a Hetzner server (Tailscale first, then public IPv4). */
export async function resolveServerSshHost(server: {
  readonly name: string;
  readonly public_net: { readonly ipv4: { readonly ip: string } | null };
}): Promise<string | null> {
  const publicIp = server.public_net.ipv4?.ip ?? null;
  if (!server.name.trim() && !publicIp) return null;
  return resolveSshHost(server.name.trim() || publicIp!, { alsoTry: publicIp });
}

export async function checkSshConnection(
  hostOrName: string,
  options?: { readonly alsoTry?: string | null },
): Promise<SshConnectionResult> {
  try {
    const host = await resolveSshHost(hostOrName, options);
    await execFileAsync(
      "ssh",
      [
        "-o",
        "BatchMode=yes",
        "-o",
        "ConnectTimeout=8",
        "-o",
        "StrictHostKeyChecking=accept-new",
        `${SSH_USER}@${host}`,
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
  hostOrName: string,
  remoteCommand: string,
  options?: {
    readonly timeoutMs?: number;
    readonly maxBuffer?: number;
    readonly alsoTry?: string | null;
  },
): Promise<string> {
  try {
    const host = await resolveSshHost(hostOrName, {
      alsoTry: options?.alsoTry,
    });
    const { stdout } = await execFileAsync(
      "ssh",
      [
        "-o",
        "BatchMode=yes",
        "-o",
        "ConnectTimeout=8",
        "-o",
        "StrictHostKeyChecking=accept-new",
        `${SSH_USER}@${host}`,
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
