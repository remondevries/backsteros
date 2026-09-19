/**
 * Fill empty `BACKSTEROS_R2_*` vars from `~/.config/secrets/backsteros-r2.env`.
 * Never reads `cloudflare-r2.env` (that file is the public WordPress bucket).
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const KEYS = [
  "BACKSTEROS_R2_BUCKET",
  "BACKSTEROS_R2_ENDPOINT",
  "BACKSTEROS_R2_ACCESS_KEY_ID",
  "BACKSTEROS_R2_SECRET_ACCESS_KEY",
  "BACKSTEROS_R2_REGION",
] as const;

export function loadBacksterosR2Env(
  env: NodeJS.ProcessEnv = process.env,
): void {
  const filePath = path.join(
    os.homedir(),
    ".config",
    "secrets",
    "backsteros-r2.env",
  );
  let text: string;
  try {
    text = fs.readFileSync(filePath, "utf8");
  } catch {
    return;
  }
  for (const line of text.split("\n")) {
    const match = /^(?:export\s+)?([A-Z0-9_]+)=(.*)$/u.exec(line.trim());
    if (!match) continue;
    const name = match[1]!;
    if (!KEYS.includes(name as (typeof KEYS)[number])) continue;
    if (env[name]?.trim()) continue;
    const value = match[2]!.trim().replace(/^['"]|['"]$/gu, "");
    if (value) env[name] = value;
  }
}
