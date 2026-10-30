/**
 * Desktop-local gate: an agent only joins the shell chat roster after a
 * successful webhook test (SettingsTestConnectionSwap). Cleared when URL or
 * secret changes so a stale green check cannot keep a broken hook in chat.
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
