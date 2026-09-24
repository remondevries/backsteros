import type { EmailReplyLanguage } from "../lib/email-reply-assembler.js";
import {
  detectEmailLanguage,
  parseReplyToAddress,
} from "../lib/email-reply-assembler.js";

/** Prefer contact language, then .nl TLD, then body heuristics. */
export function resolveEmailAgentLanguage(input: {
  contactLanguages?: readonly string[] | null;
  counterpartEmail?: string | null;
  messageText?: string | null;
}): EmailReplyLanguage {
  for (const raw of input.contactLanguages ?? []) {
    const lang = raw.trim().toLowerCase();
    if (lang === "nl" || lang.startsWith("nl-")) return "nl";
    if (lang === "en" || lang.startsWith("en-")) return "en";
  }

  const email = parseReplyToAddress(input.counterpartEmail ?? "").toLowerCase();
  const host = email.includes("@") ? email.split("@")[1] ?? "" : "";
  if (host.endsWith(".nl")) return "nl";

  return detectEmailLanguage(input.messageText);
}

export function authorizationHeaderFromWebhookKey(webhookKey: string): string {
  const trimmed = webhookKey.trim();
  if (!trimmed) return "";
  if (/^bearer\s+/i.test(trimmed)) return trimmed;
  return `Bearer ${trimmed}`;
}

export const EMAIL_AGENT_ALLOWED_INTENTS = [
  "reply_draft",
  "task",
  "calendar",
  "note",
] as const;

export type EmailAgentAllowedIntent =
  (typeof EMAIL_AGENT_ALLOWED_INTENTS)[number];

/**
 * Wake payload for the shared Grok Bot webhook (Judith).
 * Prefer `email.agent_command`. When `intent` is set, skip classification.
 */
export type EmailGrokWakePayload = {
  kind: "email.agent_command";
  requestId: string;
  callbackUrl: string;
  language: EmailReplyLanguage;
  userPrompt: string;
  inboxId: string;
  messageId: string;
  threadId: string | null;
  currentDraftBody: string | null;
  /** Fixed intent from the UI when set — bot must not reclassify. */
  intent: EmailAgentAllowedIntent | null;
  allowedIntents: readonly EmailAgentAllowedIntent[];
  email: {
    from: string;
    to: string[];
    subject: string;
    text: string;
  };
  instructions: string[];
};

export function buildEmailGrokWakePayload(input: {
  requestId: string;
  callbackUrl: string;
  language: EmailReplyLanguage;
  userPrompt: string;
  inboxId: string;
  messageId: string;
  threadId?: string | null;
  currentDraftBody?: string | null;
  /** When set, only this intent is allowed and instructions skip classification. */
  intent?: EmailAgentAllowedIntent | null;
  from: string;
  to: string[];
  subject: string;
  text: string;
}): EmailGrokWakePayload {
  const languageLabel = input.language === "nl" ? "Dutch" : "English";
  const fixedIntent = input.intent ?? null;
  const allowedIntents: EmailAgentAllowedIntent[] = fixedIntent
    ? [fixedIntent]
    : [...EMAIL_AGENT_ALLOWED_INTENTS];

  const instructions =
    fixedIntent === "reply_draft"
      ? [
          "Intent is FIXED: reply_draft. Do not classify. Do not create a task, calendar event, or note.",
          `Write the email reply body in ${languageLabel}. Output ONLY the message body (no greeting/sign-off — BacksterOS adds those). Do not include subject, To/Cc, or markdown wrappers.`,
          "Use userPrompt as the instruction for how to reply. The open email is CONTEXT.",
          "Do not invent recipients, prices, deadlines, or commitments that are not in the user prompt or email.",
          "Do not send external email. Human review before send remains outside this callback.",
          "When finished, POST JSON to callbackUrl with requestId echoed exactly.",
          'Success: { ok:true, requestId, intent:"reply_draft", body }. Legacy { ok:true, requestId, body } is also accepted.',
          "On failure, POST { ok:false, requestId, error }.",
        ]
      : fixedIntent
        ? [
            `Intent is FIXED: ${fixedIntent}. Do not classify as another intent.`,
            `Allowed intents: ${allowedIntents.join(", ")}.`,
            "Do not invent recipients, prices, deadlines, or commitments that are not in the user prompt or email.",
            "Do not send external email. Human review before send remains outside this callback.",
            "When finished, POST JSON to callbackUrl with requestId echoed exactly.",
            'Success shapes: { ok:true, requestId, intent:"reply_draft", body } | { ok:true, requestId, intent:"task", task:{ title, description?, projectKey?, dueDate? } } | { ok:true, requestId, intent:"calendar", event:{ title, start, end, notes? } } | { ok:true, requestId, intent:"note", message }.',
            "On failure, POST { ok:false, requestId, error }.",
          ]
        : [
            "Classify intent from userPrompt. The open email is CONTEXT only — do not assume the user always wants a reply draft.",
            `Allowed intents: ${EMAIL_AGENT_ALLOWED_INTENTS.join(", ")}.`,
            "Do not invent recipients, prices, deadlines, or commitments that are not in the user prompt or email.",
            "Do not send external email. Human review before send remains outside this callback.",
            `When intent is reply_draft: write the email body in ${languageLabel}. Output ONLY the message body (no greeting/sign-off — BacksterOS adds those). Do not include subject, To/Cc, or markdown wrappers.`,
            "When finished, POST JSON to callbackUrl with requestId echoed exactly.",
            'Success shapes: { ok:true, requestId, intent:"reply_draft", body } | { ok:true, requestId, intent:"task", task:{ title, description?, projectKey?, dueDate? } } | { ok:true, requestId, intent:"calendar", event:{ title, start, end, notes? } } | { ok:true, requestId, intent:"note", message }.',
            "Legacy { ok:true, requestId, body } (no intent) is accepted as reply_draft.",
            "On failure, POST { ok:false, requestId, error }.",
          ];

  return {
    kind: "email.agent_command",
    requestId: input.requestId,
    callbackUrl: input.callbackUrl,
    language: input.language,
    userPrompt: input.userPrompt.trim(),
    inboxId: input.inboxId,
    messageId: input.messageId,
    threadId: input.threadId?.trim() || null,
    currentDraftBody: input.currentDraftBody?.trim() || null,
    intent: fixedIntent,
    allowedIntents,
    email: {
      from: input.from,
      to: input.to,
      subject: input.subject,
      text: input.text,
    },
    instructions,
  };
}

export async function wakeEmailGrokWebhook(input: {
  webhookUrl: string;
  webhookKey: string;
  payload: EmailGrokWakePayload;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const authorization = authorizationHeaderFromWebhookKey(input.webhookKey);
  try {
    const response = await fetch(input.webhookUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: authorization,
      },
      body: JSON.stringify(input.payload),
    });
    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).trim();
      return {
        ok: false,
        error: `Webhook rejected (${response.status})${
          detail ? `: ${detail.slice(0, 240)}` : ""
        }`,
      };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Webhook request failed",
    };
  }
}

export function counterpartEmailFromMessage(from: string | null | undefined): string {
  return parseReplyToAddress(from ?? "");
}
