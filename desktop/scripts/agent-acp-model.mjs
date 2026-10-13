/**
 * Cursor ACP model preference helpers (session pin vs global request).
 */

import { asNonNegativeInt, normalizeAgentHookUsage } from "./agent-hook-usage.mjs";

export { asNonNegativeInt } from "./agent-hook-usage.mjs";

/**
 * @param {string | null | undefined} modelId
 * @returns {string}
 */
export function normalizeAcpModelId(modelId) {
  const trimmed = typeof modelId === "string" ? modelId.trim() : "";
  if (!trimmed) return "auto";
  return trimmed;
}

/**
 * Whether Cursor should receive session/set_config_option for this id.
 * `auto` leaves Cursor on its default (no config RPC).
 * @param {string | null | undefined} modelId
 */
export function shouldApplyAcpModelConfig(modelId) {
  return normalizeAcpModelId(modelId) !== "auto";
}

/**
 * Resolve which model a prompt should use.
 * Existing session pin wins over a stale global preference.
 *
 * @param {{
 *   sessionModelId?: string | null,
 *   requestedModelId?: string | null,
 *   forceRequested?: boolean,
 * }} input
 * @returns {string}
 */
export function resolveAcpModelForPrompt(input) {
  if (input.forceRequested === true) {
    return normalizeAcpModelId(input.requestedModelId);
  }
  const pinned = normalizeAcpModelId(input.sessionModelId);
  if (input.sessionModelId != null && String(input.sessionModelId).trim()) {
    return pinned;
  }
  return normalizeAcpModelId(input.requestedModelId);
}

/**
 * Parse ACP `session/update` usage_update (context window meter).
 * Drops empty/invalid payloads; never invents token counts.
 *
 * @param {unknown} update
 * @returns {ReturnType<typeof normalizeAgentHookUsage> | null}
 */
export function parseAcpUsageUpdateFromSessionUpdate(update) {
  if (!update || typeof update !== "object") return null;
  const record = /** @type {Record<string, unknown>} */ (update);
  const sessionUpdate = record.sessionUpdate ?? record.session_update;
  if (sessionUpdate !== "usage_update" && sessionUpdate !== "usageUpdate") {
    return null;
  }
  const usedTokens = asNonNegativeInt(
    record.used ?? record.usedTokens ?? record.used_tokens,
  );
  const maxTokens = asNonNegativeInt(
    record.size ?? record.maxTokens ?? record.max_tokens,
  );
  if (usedTokens == null && maxTokens == null) return null;
  if (usedTokens === 0 && maxTokens == null) return null;
  return normalizeAgentHookUsage({
    usedTokens,
    ...(maxTokens != null ? { maxTokens } : {}),
  });
}

/**
 * Optional token usage on session/prompt result.
 *
 * @param {unknown} result
 * @returns {ReturnType<typeof normalizeAgentHookUsage> | null}
 */
export function parseAcpPromptResponseUsage(result) {
  if (!result || typeof result !== "object") return null;
  const usage = /** @type {Record<string, unknown>} */ (result).usage;
  if (!usage || typeof usage !== "object") return null;
  const normalized = normalizeAgentHookUsage({ usage });
  if (!normalized) return null;
  const hasTurnTokens =
    normalized.inputTokens != null ||
    normalized.outputTokens != null ||
    normalized.totalTokens != null ||
    normalized.cacheReadTokens != null ||
    normalized.cacheWriteTokens != null;
  const hasContextWindow =
    normalized.usedTokens != null || normalized.maxTokens != null;
  if (!hasTurnTokens && !hasContextWindow) return null;
  if (
    !hasContextWindow &&
    normalized.inputTokens === 0 &&
    normalized.outputTokens === 0 &&
    normalized.totalTokens === 0
  ) {
    return null;
  }
  return normalized;
}
