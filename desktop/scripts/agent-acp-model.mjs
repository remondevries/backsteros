/**
 * Cursor ACP model preference helpers (session pin vs global request).
 */

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
