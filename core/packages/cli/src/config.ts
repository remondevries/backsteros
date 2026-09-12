import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createApiClient, ApiClientError } from "@backsteros/api-client";

export type CliConfig = {
  baseUrl: string;
  token: string;
  /** Who to attribute writes to on the API. */
  activityActor: "user" | "agent";
  /**
   * Optional contact profile for comment authorship (agent comments show as
   * this person). From BACKSTEROS_AGENT_CONTACT_ID or agent-profile.json.
   */
  agentContactId: string | null;
  json: boolean;
};

const DEFAULT_BASE_URL = "http://127.0.0.1:8788";
const DEFAULT_LOCAL_TOKEN = "local";

/** Fixed local config — no 1Password required for agents. */
export function defaultCliEnvPath(): string {
  return (
    process.env.BACKSTEROS_CLI_ENV?.trim() ||
    join(homedir(), ".config", "backsteros", "cli.env")
  );
}

/** Load KEY=VALUE lines into process.env when the key is not already set. */
export function loadCliEnvFile(path = defaultCliEnvPath()): void {
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function defaultAgentProfilePath(): string {
  return join(homedir(), ".config", "backsteros", "agent-profile.json");
}

/** Contact id from Settings → Integrations → Agent contact profile. */
export function readAgentContactIdFromProfile(
  path = defaultAgentProfilePath(),
): string | null {
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as {
      contactId?: unknown;
    };
    return typeof parsed.contactId === "string" && parsed.contactId.trim()
      ? parsed.contactId.trim()
      : null;
  } catch {
    return null;
  }
}

export function loadConfig(flags: {
  url?: string;
  token?: string;
  actor?: string;
  json?: boolean;
}): CliConfig {
  loadCliEnvFile();

  const baseUrl = (
    flags.url?.trim() ||
    process.env.BACKSTEROS_API_URL?.trim() ||
    DEFAULT_BASE_URL
  ).replace(/\/+$/, "");

  const token =
    flags.token?.trim() ||
    process.env.BACKSTEROS_API_KEY?.trim() ||
    process.env.LOCAL_SHELL_TOKEN?.trim() ||
    DEFAULT_LOCAL_TOKEN;

  const actorRaw =
    flags.actor?.trim() ||
    process.env.BACKSTEROS_ACTIVITY_ACTOR?.trim() ||
    "agent";
  if (actorRaw !== "user" && actorRaw !== "agent") {
    throw new Error(`Invalid activity actor "${actorRaw}" (use user|agent)`);
  }

  const agentContactId =
    process.env.BACKSTEROS_AGENT_CONTACT_ID?.trim() ||
    readAgentContactIdFromProfile() ||
    null;

  return {
    baseUrl,
    token,
    activityActor: actorRaw,
    agentContactId,
    json: Boolean(flags.json),
  };
}

export function createCliClient(config: CliConfig) {
  return createApiClient({
    baseUrl: config.baseUrl,
    getToken: () => config.token,
  });
}

export type CliClient = ReturnType<typeof createCliClient>;

export function isApiClientError(error: unknown): error is ApiClientError {
  return error instanceof ApiClientError;
}

export function formatCliError(error: unknown): string {
  if (isApiClientError(error)) {
    const code = error.code ? ` (${error.code})` : "";
    return `API ${error.status}${code}: ${error.message}`;
  }
  if (error instanceof Error) return error.message;
  return String(error);
}
