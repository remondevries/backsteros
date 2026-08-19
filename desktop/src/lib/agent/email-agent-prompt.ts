import type { AgentMailMessageDetail } from "@backsteros/contracts";

const GREETING_LINE =
  /^(?:hi|hello|hey|dear|beste|geachte|goedemorgen|goedemiddag|goedenavond)\b[^,\n]{0,80},?\s*$/i;

const SIGN_OFF_BLOCK =
  /\n+(?:best|thanks|thank you|sincerely|regards|cheers|groeten|met vriendelijke groet|vriendelijke groet|hartelijke groet|mvg|kind regards|best regards),?\s*\n[\s\S]*$/i;

export function extractAgentReplyBody(text: string): string {
  let body = text.trim();
  if (!body) return "";

  const shellMatch = body.match(
    /^ *(?:hi|hello|hey|dear|beste|geachte)\s+[^,\n]{1,80},?\s*\n+([\s\S]*?)\n+(?:best|groeten|met vriendelijke groet|vriendelijke groet|hartelijke groet|mvg|kind regards|best regards|cheers|thanks|sincerely),?\s*\n[\s\S]*$/i,
  );
  if (shellMatch?.[1]) body = shellMatch[1].trim();

  const lines = body.split("\n");
  while (lines.length > 0 && GREETING_LINE.test(lines[0]?.trim() ?? "")) {
    lines.shift();
  }
  body = lines.join("\n").trim();

  body = body.replace(SIGN_OFF_BLOCK, "");
  body = body.replace(/^(?:beste|geachte),?\s*\n+/i, "");

  const blocks = body
    .split(/\n\s*\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (blocks.length > 1) {
    body = blocks[blocks.length - 1] ?? body;
  }

  return body.trim();
}

/** Prefer API `body`; fall back to extracting from stored full `text`. */
export function resolveEditableEmailDraftBody(
  draft: { body?: string | null; text?: string | null } | null | undefined,
): string {
  if (!draft) return "";
  const fromBody = draft.body?.trim();
  if (fromBody) return draft.body ?? fromBody;
  const rawText = draft.text?.trim();
  if (!rawText) return "";
  return extractAgentReplyBody(rawText);
}

export function emailMessageBody(message: AgentMailMessageDetail): string {
  const extracted = message.extractedText?.trim();
  if (extracted) return extracted;
  const text = message.text?.trim();
  if (text) return text;
  const html = (message.extractedHtml ?? message.html ?? "").trim();
  if (!html) return "";
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildEmailAgentHiddenContext(
  message: AgentMailMessageDetail,
): string {
  const body = emailMessageBody(message);
  return [
    "You are helping draft email replies in BacksterOS.",
    "",
    "Rules:",
    "- When asked to draft a reply, output ONLY the reply message body.",
    "- Do not include a greeting (no Hi/Hello/Beste/Geachte) — BacksterOS adds Hi {name}, automatically.",
    "- Do not include a sign-off (no Best/Met vriendelijke groet/Groeten) — BacksterOS adds Best, Remon automatically.",
    "- Do not repeat earlier draft versions; output one final body only.",
    "- Do not include subject, To/Cc lines, or markdown wrappers.",
    "- Do not call APIs, tools, or MCP.",
    "",
    "--- Email being replied to ---",
    `From: ${message.from || "Unknown sender"}`,
    `Subject: ${message.subject?.trim() || "(no subject)"}`,
    "",
    body || "(no text body)",
    "--- End email ---",
  ].join("\n");
}

export function buildEmailAgentAcpPrompt(
  userPrompt: string,
  message: AgentMailMessageDetail,
): string {
  return `${buildEmailAgentHiddenContext(message)}\n\n--- User request ---\n${userPrompt.trim()}`;
}

export type EmailComposeContext = {
  fromEmail: string;
  to: string;
  subject: string;
};

export function buildEmailComposeAgentHiddenContext(
  context: EmailComposeContext,
): string {
  return [
    "You are helping draft new emails in BacksterOS.",
    "",
    "Rules:",
    "- When asked to draft an email, output ONLY the message body.",
    "- Do not include a greeting (no Hi/Hello/Beste/Geachte) — BacksterOS adds Hi {name}, automatically.",
    "- Do not include a sign-off (no Best/Met vriendelijke groet/Groeten) — BacksterOS adds Best, Remon automatically.",
    "- Do not repeat earlier draft versions; output one final body only.",
    "- Do not include subject, To/Cc lines, or markdown wrappers.",
    "- Do not call APIs, tools, or MCP.",
    "",
    "--- New email ---",
    `From: ${context.fromEmail.trim() || "Unknown inbox"}`,
    `To: ${context.to.trim() || "(not set)"}`,
    `Subject: ${context.subject.trim() || "(no subject)"}`,
    "--- End email ---",
  ].join("\n");
}

export function buildEmailComposeAgentAcpPrompt(
  userPrompt: string,
  context: EmailComposeContext,
): string {
  return `${buildEmailComposeAgentHiddenContext(context)}\n\n--- User request ---\n${userPrompt.trim()}`;
}

export function emailComposeAgentTaskId(): string {
  return "email:compose";
}

export function emailAgentTaskId(inboxId: string, messageId: string): string {
  return `email:${inboxId}:${messageId}`;
}

const EMAIL_AGENT_CHAT_STORAGE_PREFIX = "backsteros-desktop.email-agent-chat.";

export function readEmailAgentChatId(taskId: string): string | null {
  try {
    return localStorage.getItem(`${EMAIL_AGENT_CHAT_STORAGE_PREFIX}${taskId}`);
  } catch {
    return null;
  }
}

export function writeEmailAgentChatId(
  taskId: string,
  chatId: string | null,
): void {
  try {
    const key = `${EMAIL_AGENT_CHAT_STORAGE_PREFIX}${taskId}`;
    if (chatId?.trim()) localStorage.setItem(key, chatId.trim());
    else localStorage.removeItem(key);
  } catch {
    // Ignore private mode / quota errors.
  }
}
