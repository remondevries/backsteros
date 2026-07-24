/** Hold-comment bodies always start with one of these observer prefixes. */
export const AGENT_HOLD_COMMENT_PREFIXES = [
  "Agent could not start.",
  "Agent failed to complete this task.",
  "Agent needs input before it can continue.",
] as const;

/** True when a comment body was produced by the agent-hold observer. */
export function isAgentHoldCommentBody(
  body: string | null | undefined,
): boolean {
  const trimmed = body?.trim() ?? "";
  if (!trimmed) return false;
  return AGENT_HOLD_COMMENT_PREFIXES.some(
    (prefix) => trimmed === prefix || trimmed.startsWith(`${prefix}\n`),
  );
}
