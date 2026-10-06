import { chmod, mkdir, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";

export const DYNAMIC_ISLAND_ENV_RELATIVE = ".config/dynamic-island/backsteros.env";
export const DYNAMIC_ISLAND_DEFAULT_API_URL = "http://127.0.0.1:8788";

export function dynamicIslandEnvPath(home = homedir()): string {
  return join(home, DYNAMIC_ISLAND_ENV_RELATIVE);
}

export function loopbackApiUrl(raw: string | undefined): string {
  const fallback = DYNAMIC_ISLAND_DEFAULT_API_URL;
  if (!raw?.trim()) return fallback;
  try {
    const url = new URL(raw.trim());
    const host = url.hostname.toLowerCase();
    if (host !== "127.0.0.1" && host !== "localhost" && host !== "::1") {
      return fallback;
    }
    const port = url.port ? `:${url.port}` : "";
    return `${url.protocol}//${host}${port}`;
  } catch {
    return fallback;
  }
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
