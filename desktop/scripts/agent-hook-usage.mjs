/**
 * Normalize Cursor hook / ACP usage payloads for Chat agent-hook fan-out.
 */

/**
 * @param {unknown} value
 * @returns {number | null}
 */
export function asNonNegativeInt(value) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.round(value);
  }
  return null;
}

/**
 * @param {unknown} payload
 * @returns {Record<string, unknown> | null}
 */
function usageRecordFromPayload(payload) {
  if (!payload || typeof payload !== "object") return null;
  const record = /** @type {Record<string, unknown>} */ (payload);
  if (record.usage && typeof record.usage === "object") {
    return /** @type {Record<string, unknown>} */ (record.usage);
  }
  if (record.token_usage && typeof record.token_usage === "object") {
    return /** @type {Record<string, unknown>} */ (record.token_usage);
  }
  if (record.tokenUsage && typeof record.tokenUsage === "object") {
    return /** @type {Record<string, unknown>} */ (record.tokenUsage);
  }
  return record;
}

/**
 * Cursor stop hooks / stream-json / ACP may use snake_case or camelCase.
 * Returns null when no usable numeric fields are present (never invent).
 *
 * @param {unknown} payload
 * @returns {{
 *   inputTokens: number | null,
 *   outputTokens: number | null,
 *   cacheReadTokens: number | null,
 *   cacheWriteTokens: number | null,
 *   totalTokens: number | null,
 *   usedTokens: number | null,
 *   maxTokens: number | null,
 *   durationMs: number | null,
 *   status: string | null,
 *   conversationId: string | null,
 * } | null}
 */
export function normalizeAgentHookUsage(payload) {
  const usage = usageRecordFromPayload(payload);
  if (!usage) return null;

  const inputTokens = asNonNegativeInt(
    usage.inputTokens ?? usage.input_tokens,
  );
  const outputTokens = asNonNegativeInt(
    usage.outputTokens ?? usage.output_tokens,
  );
  const cacheReadTokens = asNonNegativeInt(
    usage.cacheReadTokens ?? usage.cache_read_tokens,
  );
  const cacheWriteTokens = asNonNegativeInt(
    usage.cacheWriteTokens ?? usage.cache_write_tokens,
  );
  const usedTokens = asNonNegativeInt(
    usage.usedTokens ?? usage.used_tokens ?? usage.used,
  );
  const maxTokens = asNonNegativeInt(
    usage.maxTokens ?? usage.max_tokens ?? usage.size,
  );
  const durationMsResolved = asNonNegativeInt(
    (payload && typeof payload === "object"
      ? (/** @type {Record<string, unknown>} */ (payload).duration_ms ??
          /** @type {Record<string, unknown>} */ (payload).durationMs ??
          /** @type {Record<string, unknown>} */ (payload).duration)
      : null) ??
      usage.duration_ms ??
      usage.durationMs ??
      usage.duration,
  );

  const status =
    payload && typeof payload === "object" &&
    typeof /** @type {Record<string, unknown>} */ (payload).status === "string"
      ? /** @type {Record<string, unknown>} */ (payload).status
      : typeof usage.status === "string"
        ? usage.status
        : null;
  const conversationId =
    payload && typeof payload === "object"
      ? (typeof /** @type {Record<string, unknown>} */ (payload).conversation_id ===
          "string" &&
          /** @type {Record<string, unknown>} */ (payload).conversation_id) ||
        (typeof /** @type {Record<string, unknown>} */ (payload).conversationId ===
          "string" &&
          /** @type {Record<string, unknown>} */ (payload).conversationId) ||
        null
      : null;

  let totalTokens = asNonNegativeInt(usage.totalTokens ?? usage.total_tokens);
  if (totalTokens == null) {
    const parts = [inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens]
      .filter((value) => value != null);
    if (parts.length > 0) {
      totalTokens = parts.reduce((sum, value) => sum + value, 0);
    }
  }

  if (
    inputTokens == null &&
    outputTokens == null &&
    cacheReadTokens == null &&
    cacheWriteTokens == null &&
    totalTokens == null &&
    usedTokens == null &&
    maxTokens == null &&
    durationMsResolved == null &&
    !status &&
    !conversationId
  ) {
    return null;
  }

  return {
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    totalTokens,
    usedTokens,
    maxTokens,
    durationMs: durationMsResolved,
    status,
    conversationId,
  };
}

/**
 * @param {NonNullable<ReturnType<typeof normalizeAgentHookUsage>>} usage
 */
export function buildAcpUsageAgentHookMessage(usage) {
  return {
    type: "agent-hook",
    event: "usageUpdate",
    activity: null,
    usage,
    source: "acp",
  };
}
