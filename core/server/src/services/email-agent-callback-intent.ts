import type {
  EmailAgentCallbackResult,
  EmailAgentIntent,
} from "@backsteros/contracts";

/** Map a successful email-agent callback body to the intent to apply. */
export function resolveEmailAgentSuccessIntent(
  body: Extract<EmailAgentCallbackResult, { ok: true }>,
): EmailAgentIntent | null {
  if (body.intent) return body.intent;
  if (body.body?.trim()) return "reply_draft";
  return null;
}
