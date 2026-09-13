/**
 * Env / machine-secret TransIP credentials.
 * Order for legacy token: `TRANSIP_ACCESS_TOKEN` → `~/.config/secrets/transip.env`.
 * Optional key auth: `TRANSIP_LOGIN` + `TRANSIP_PRIVATE_KEY` (or `_FILE`).
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function readEnvFile(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const filePath = path.join(os.homedir(), ".config", "secrets", "transip.env");
    const text = fs.readFileSync(filePath, "utf8");
    for (const line of text.split("\n")) {
      const match = /^(?:export\s+)?([A-Z0-9_]+)=(.*)$/u.exec(line.trim());
      if (!match) continue;
      const value = match[2]!.trim().replace(/^['"]|['"]$/gu, "");
      if (value) out[match[1]!] = value.replace(/\\n/gu, "\n");
    }
  } catch {
    // Fall through.
  }
  return out;
}

function readPrivateKeyFromPath(filePath: string): string | null {
  try {
    const text = fs.readFileSync(filePath.trim(), "utf8").trim();
    return text || null;
  } catch {
    return null;
  }
}

export function getConfiguredTransipAccessToken(): string | null {
  const fromEnv = process.env.TRANSIP_ACCESS_TOKEN?.trim() || "";
  if (fromEnv) return fromEnv;
  const fromFile = readEnvFile().TRANSIP_ACCESS_TOKEN?.trim() || "";
  return fromFile || null;
}

export function getConfiguredTransipKeyCredentials(): {
  login: string;
  privateKey: string;
} | null {
  const file = readEnvFile();
  const login =
    process.env.TRANSIP_LOGIN?.trim() || file.TRANSIP_LOGIN?.trim() || "";
  const keyPath =
    process.env.TRANSIP_PRIVATE_KEY_FILE?.trim() ||
    file.TRANSIP_PRIVATE_KEY_FILE?.trim() ||
    "";
  const fromFilePath = keyPath ? readPrivateKeyFromPath(keyPath) : null;
  const privateKey =
    process.env.TRANSIP_PRIVATE_KEY?.trim()?.replace(/\\n/gu, "\n") ||
    file.TRANSIP_PRIVATE_KEY?.trim() ||
    fromFilePath ||
    "";
  if (!login || !privateKey) return null;
  return { login, privateKey };
}

export function isTransipAccessTokenConfigured(): boolean {
  return (
    getConfiguredTransipAccessToken() != null ||
    getConfiguredTransipKeyCredentials() != null
  );
}
