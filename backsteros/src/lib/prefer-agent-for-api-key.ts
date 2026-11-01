import type { Agent } from "@backsteros/contracts";

/**
 * `POST /api/v1/agents` returns 409 `{ existingAgentId }` when the API key is
 * already linked to an agent (CloudCoreApiError message is `409 <body>`).
 * Returns that id, else null.
 */
export function existingAgentIdFromConflict(error: unknown): string | null {
  if (!(error instanceof Error)) return null;
  if ((error as { status?: unknown }).status !== 409) return null;
  const jsonStart = error.message.indexOf("{");
  if (jsonStart < 0) return null;
  try {
    const body = JSON.parse(error.message.slice(jsonStart)) as {
      existingAgentId?: unknown;
    };
    return typeof body.existingAgentId === "string" &&
      body.existingAgentId.trim()
      ? body.existingAgentId.trim()
      : null;
  } catch {
    return null;
  }
}

/**
 * Legacy data can have two agent rows for one API key (duplicate Judith; new
 * cores reject the second create). Prefer the enabled row that already has
 * webhook credentials so Save/Test hit the same persona the chat shows.
 */
export function preferAgentForApiKey(
  agents: readonly Agent[],
  apiKeyId: string,
): Agent | undefined {
  const matches = agents.filter((agent) => agent.apiKeyId === apiKeyId);
  if (matches.length <= 1) return matches[0];
  const score = (agent: Agent): number =>
    (agent.enabled ? 8 : 0) +
    (agent.webhookUrl?.trim() ? 4 : 0) +
    (agent.webhookSecretConfigured ? 2 : 0) +
    (agent.webhookVerifiedAt?.trim() ? 1 : 0);
  return [...matches].sort(
    (a, b) =>
      score(b) - score(a) || (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
  )[0];
}
