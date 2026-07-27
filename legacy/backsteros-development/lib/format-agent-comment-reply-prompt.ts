/**
 * Build the agent prompt for a user reply on an agent comment thread.
 * Includes the parent agent message so the reply is in context.
 */
export function formatAgentCommentReplyPrompt(input: {
  parentBody: string;
  replyBody: string;
}): string {
  const parent = input.parentBody.trim();
  const reply = input.replyBody.trim();
  if (!reply) return "";
  if (!parent) return reply;
  return [
    "The user is replying to this agent comment on the BacksterOS task.",
    "Treat the reply as a follow-up in that thread — not a new standalone request.",
    "",
    "Original agent comment:",
    "---",
    parent,
    "---",
    "",
    "User reply:",
    reply,
  ].join("\n");
}
