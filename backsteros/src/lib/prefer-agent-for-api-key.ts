import type { Agent } from "@backsteros/contracts";

/**
 * One API key can accidentally get two agent rows (duplicate Judith). Prefer the
 * row that already has webhook credentials so Save/Test hit the same persona.
 */
export function preferAgentForApiKey(
  agents: readonly Agent[],
  apiKeyId: string,
): Agent | undefined {
  const matches = agents.filter((agent) => agent.apiKeyId === apiKeyId);
  if (matches.length <= 1) return matches[0];
  const score = (agent: Agent): number =>
    (agent.webhookUrl?.trim() ? 4 : 0) +
    (agent.webhookSecretConfigured ? 2 : 0) +
    (agent.webhookVerifiedAt?.trim() ? 1 : 0);
  return [...matches].sort(
    (a, b) =>
      score(b) - score(a) || (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
  )[0];
}
