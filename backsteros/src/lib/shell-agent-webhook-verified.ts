/**
 * @deprecated OS-164 — chat roster reads `agent.webhookVerifiedAt` from the
 * server. These localStorage helpers are unused; kept only until Remon
 * confirms they can be deleted.
 */

const STORAGE_PREFIX = "backsteros:agent-webhook-verified:";

function storageKey(agentId: string): string {
  return `${STORAGE_PREFIX}${agentId.trim()}`;
}

export function isAgentWebhookVerified(agentId: string): boolean {
  const id = agentId.trim();
  if (!id || typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(storageKey(id)) === "1";
  } catch {
    return false;
  }
}

export function markAgentWebhookVerified(agentId: string): void {
  const id = agentId.trim();
  if (!id || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(id), "1");
  } catch {
    // ignore quota / private mode
  }
}

export function clearAgentWebhookVerified(agentId: string): void {
  const id = agentId.trim();
  if (!id || typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey(id));
  } catch {
    // ignore
  }
}
