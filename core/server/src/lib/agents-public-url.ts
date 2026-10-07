/**
 * Public HTTPS door for agents (Grok Bot callbacks, AgentMail webhooks).
 * Callbacks and inbound webhooks must never mint against dead staging hosts.
 */

export const DEFAULT_AGENTS_PUBLIC_URL = "https://agent.backsteros.com";

/** Hostnames served by agents/ (nginx → cloud-core). */
export const AGENTS_DOOR_HOSTNAMES = [
  "agent.backsteros.com",
  "agents.backsteros.com",
] as const;

export function isAgentsDoorHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase();
  return (AGENTS_DOOR_HOSTNAMES as readonly string[]).includes(host);
}

/** True when `base` is an https origin on the agents door. */
export function isAgentsDoorPublicBase(base: string): boolean {
  try {
    const url = new URL(base.includes("://") ? base : `https://${base}`);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    return isAgentsDoorHostname(url.hostname);
  } catch {
    return false;
  }
}

/**
 * Resolve the public agents origin for callback URLs.
 * Ignores stale AGENTS_PUBLIC_URL values (e.g. staging.backsteros.com).
 */
export function resolveAgentsPublicBase(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const configured =
    env.FILE_TASK_CALLBACK_PUBLIC_URL?.trim() ||
    env.AGENTS_PUBLIC_URL?.trim();
  const candidate = (configured || DEFAULT_AGENTS_PUBLIC_URL).replace(
    /\/$/,
    "",
  );
  if (isAgentsDoorPublicBase(candidate)) return candidate;
  return DEFAULT_AGENTS_PUBLIC_URL;
}

/**
 * AgentMail inbound webhook base, or null when unset / invalid / local-core.
 * Local-core must not register webhooks — the public door is cloud-core.
 */
export function resolveAgentsPublicWebhookBase(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  if (env.CORE_REPLICATION_ROLE?.trim().toLowerCase() === "local") {
    return null;
  }
  const configured = env.AGENTS_PUBLIC_URL?.trim().replace(/\/$/, "");
  if (!configured) return null;
  if (!isAgentsDoorPublicBase(configured)) return null;
  return configured;
}
