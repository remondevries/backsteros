import { chmod, mkdir, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";

export const DYNAMIC_ISLAND_ENV_RELATIVE = ".config/dynamic-island/backsteros.env";
export const DYNAMIC_ISLAND_DEFAULT_API_URL = "http://127.0.0.1:8788";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

export function dynamicIslandEnvPath(home = homedir()): string {
  return join(home, DYNAMIC_ISLAND_ENV_RELATIVE);
}

/**
 * Validate that the API URL is a local-core loopback origin before any request.
 * Empty/unset → default. Never silently rewrites a non-loopback host.
 * Returns the normalised origin (protocol + host + port). Host only in errors.
 */
export function requireLoopbackApiUrl(raw: string | undefined): string {
  const value = raw?.trim() || DYNAMIC_ISLAND_DEFAULT_API_URL;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(
      "dynamic-island pair only talks to a local core (127.0.0.1, ::1, localhost); got invalid URL. Use --url http://127.0.0.1:8788.",
    );
  }
  const protocol = url.protocol.toLowerCase();
  if (protocol !== "http:" && protocol !== "https:") {
    throw new Error(
      `dynamic-island pair only talks to a local core (127.0.0.1, ::1, localhost); got ${url.hostname || "invalid host"}. Use --url http://127.0.0.1:8788.`,
    );
  }
  // Node may return IPv6 hostnames with or without brackets.
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!LOOPBACK_HOSTS.has(host)) {
    throw new Error(
      `dynamic-island pair only talks to a local core (127.0.0.1, ::1, localhost); got ${host}. Use --url http://127.0.0.1:8788.`,
    );
  }
  return url.origin;
}

export function formatDynamicIslandEnv(apiUrl: string, apiKey: string): string {
  return [
    "# Dynamic Island → local BacksterOS core (do not commit).",
    `BACKSTEROS_API_URL=${apiUrl}`,
    `BACKSTEROS_API_KEY=${apiKey}`,
    "",
  ].join("\n");
}

/** Atomic 0600 write; directory 0700. Never logs the secret. */
export async function writeDynamicIslandEnvFile(input: {
  home: string;
  apiUrl: string;
  apiKey: string;
}): Promise<string> {
  const dest = dynamicIslandEnvPath(input.home);
  const dir = dirname(dest);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await chmod(dir, 0o700).catch(() => undefined);
  const tmp = join(dir, `.backsteros.env.${randomBytes(8).toString("hex")}.tmp`);
  const body = formatDynamicIslandEnv(input.apiUrl, input.apiKey);
  await writeFile(tmp, body, { encoding: "utf8", mode: 0o600 });
  await chmod(tmp, 0o600);
  await rename(tmp, dest);
  return dest;
}
