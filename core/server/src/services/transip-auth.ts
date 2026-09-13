/**
 * Env / machine-secret TransIP access token.
 * Order: `TRANSIP_ACCESS_TOKEN` → `~/.config/secrets/transip.env`.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function readTokenFromTransipEnvFile(): string | null {
  try {
    const filePath = path.join(os.homedir(), ".config", "secrets", "transip.env");
    const text = fs.readFileSync(filePath, "utf8");
    for (const line of text.split("\n")) {
      const match = /^(?:export\s+)?TRANSIP_ACCESS_TOKEN=(.+)$/u.exec(
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

export function getConfiguredTransipAccessToken(): string | null {
  const fromEnv = process.env.TRANSIP_ACCESS_TOKEN?.trim() || "";
  if (fromEnv) return fromEnv;
  return readTokenFromTransipEnvFile();
}

export function isTransipAccessTokenConfigured(): boolean {
  return getConfiguredTransipAccessToken() != null;
}
