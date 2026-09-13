/**
 * Env / machine-secret Cloudflare API token.
 * Order: `CLOUDFLARE_API_TOKEN` → `~/.config/secrets/cloudflare.env`.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function readTokenFromCloudflareEnvFile(): string | null {
  try {
    const filePath = path.join(
      os.homedir(),
      ".config",
      "secrets",
      "cloudflare.env",
    );
    const text = fs.readFileSync(filePath, "utf8");
    for (const line of text.split("\n")) {
      const match = /^(?:export\s+)?CLOUDFLARE_API_TOKEN=(.+)$/u.exec(
        line.trim(),
      );
      if (!match) continue;
      const value = match[1]!.trim().replace(/^['"]|['"]$/gu, "");
      if (value) return value;
    }
  } catch {
    // Fall through.
  }
  return null;
}

export function getConfiguredCloudflareApiToken(): string | null {
  const fromEnv = process.env.CLOUDFLARE_API_TOKEN?.trim() || "";
  if (fromEnv) return fromEnv;
  return readTokenFromCloudflareEnvFile();
}

export function isCloudflareApiTokenConfigured(): boolean {
  return getConfiguredCloudflareApiToken() != null;
}
