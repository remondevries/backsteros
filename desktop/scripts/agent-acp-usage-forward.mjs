import {
  buildAcpUsageAgentHookMessage,
  normalizeAgentHookUsage,
} from "./agent-hook-usage.mjs";

/**
 * Map an ACP manager `usage-update` event to a Chat agent-hook frame.
 *
 * @param {{ type?: string, usage?: unknown }} event
 */
export function agentHookMessageFromAcpUsageEvent(event) {
  if (event?.type !== "usage-update") return null;
  const usage =
    event.usage && typeof event.usage === "object"
      ? normalizeAgentHookUsage({ usage: event.usage })
      : null;
  if (!usage) return null;
  return buildAcpUsageAgentHookMessage(usage);
}
