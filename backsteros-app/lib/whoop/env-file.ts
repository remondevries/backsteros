import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export function getDefaultWhoopDataDir(): string {
  return (
    process.env.BACKSTER_DATA_DIR?.trim() ||
    join(homedir(), ".backsteros-agent")
  );
}

export function getTotemEnvPath(): string {
  const configured = process.env.TOTEM_ENV_PATH?.trim();
  if (configured) {
    return configured;
  }
  return join(getDefaultWhoopDataDir(), "totem.env");
}

export function readEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) {
    return {};
  }

  const result: Record<string, string> = {};
  const content = readFileSync(path, "utf8");

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separator = trimmed.indexOf("=");
    if (separator <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    result[key] = value;
  }

  return result;
}

export function loadTotemEnvIntoProcess(): void {
  const fileEnv = readEnvFile(getTotemEnvPath());
  for (const [key, value] of Object.entries(fileEnv)) {
    if (!process.env[key]?.trim()) {
      process.env[key] = value;
    }
  }
}
