import type { AgentMailMessageDetail, EmailThreadComment } from "@backsteros/contracts";

const GREETING_LINE =
  /^(?:hi|hello|hey|dear|beste|geachte|goedemorgen|goedemiddag|goedenavond)\b[^,\n]{0,80},?\s*$/i;

const SIGN_OFF_BLOCK =
  /\n+(?:best|thanks|thank you|sincerely|regards|cheers|groeten|met vriendelijke groet|vriendelijke groet|hartelijke groet|mvg|kind regards|best regards),?\s*\n[\s\S]*$/i;

const REPLY_DRAFT_BLOCK =
  /```REPLY_DRAFT\s*\n([\s\S]*?)```/i;

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

export function emailMessageBody(message: {
  extractedText?: string | null;
  text?: string | null;
  extractedHtml?: string | null;
  html?: string | null;
}): string {
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

export type ParsedEmailAgentCommentResponse = {
  /** Natural-language comment shown in the timeline (draft fence stripped). */
  commentBody: string;
  /** Optional reply body to materialize as a concept draft. */
  replyDraftBody: string | null;
};

/** Split agent output into timeline comment + optional REPLY_DRAFT block.
 * When a reply draft is present, the acknowledgment text is discarded — the
 * draft alone is enough on the timeline. */
export function parseEmailAgentCommentResponse(
  text: string,
): ParsedEmailAgentCommentResponse {
  const raw = text.trim();
  if (!raw) return { commentBody: "", replyDraftBody: null };

  const match = raw.match(REPLY_DRAFT_BLOCK);
  const replyDraftBody = match?.[1]?.trim() || null;
  if (replyDraftBody) {
    return { commentBody: "", replyDraftBody };
  }

  const commentBody = raw.replace(/\n{3,}/g, "\n\n").trim();
  return { commentBody, replyDraftBody: null };
}

/** Human-readable local time + ISO so the agent can answer "when?" questions. */
export function formatEmailReceivedForAgent(
  timestamp: string | null | undefined,
): string {
  const raw = timestamp?.trim();
  if (!raw) return "(unknown)";
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return raw;
  const at = new Date(ms);
  const local = new Intl.DateTimeFormat(undefined, {
    dateStyle: "full",
    timeStyle: "long",
  }).format(at);
  return `${local} (ISO: ${at.toISOString()})`;
}

function formatCommentHistory(
  comments: readonly EmailThreadComment[] | null | undefined,
  assigneeLabel: string,
): string[] {
  const rows = (comments ?? [])
    .slice()
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    )
    .map((comment) => ({
      author: comment.author === "agent" ? assigneeLabel : "User",
      body: comment.body?.trim() || "",
      at: formatEmailReceivedForAgent(comment.createdAt),
    }))
    .filter((row) => row.body);
  if (rows.length === 0) return [];
  return [
    "",
    "--- Thread comments (oldest → newest) ---",
    ...rows.flatMap((row, index) => [
      `${index + 1}. ${row.author} · ${row.at}:`,
      row.body,
      "",
    ]),
    "--- End comments ---",
  ];
}

function formatThreadMetadata(message: AgentMailMessageDetail): string[] {
  const meta = message.threadMetadata;
  const lines = [
    "",
    "--- Thread context ---",
    `Inbox: ${message.inboxEmail?.trim() || message.inboxId || "(unknown)"}`,
    `Thread id: ${message.threadId?.trim() || message.messageId}`,
    `Message id: ${message.messageId}`,
  ];
  if (meta?.contactName?.trim() || meta?.contactId) {
    lines.push(
      `Linked contact: ${meta.contactName?.trim() || meta.contactId || "(none)"}`,
    );
  }
  if (meta?.organizationName?.trim() || meta?.organizationId) {
    lines.push(
      `Linked organization: ${
        meta.organizationName?.trim() || meta.organizationId || "(none)"
      }`,
    );
  }
  if (meta?.assigneeName?.trim() || meta?.assigneeId) {
    lines.push(
      `Assignee: ${meta.assigneeName?.trim() || meta.assigneeId || "(none)"}`,
    );
  }
  if (meta?.projectName?.trim() || meta?.projectKey) {
    lines.push(
      `Project: ${
        meta.projectName?.trim() || meta.projectKey || "(none)"
      }`,
    );
  }
  if (meta?.status) lines.push(`Status: ${meta.status}`);
  if (meta?.priority != null) lines.push(`Priority: ${meta.priority}`);
  if (meta?.dueDate) {
    lines.push(`Due: ${formatEmailReceivedForAgent(meta.dueDate)}`);
  }
  lines.push("--- End thread context ---");
  return lines;
}

function formatExistingDraft(message: AgentMailMessageDetail): string[] {
  const draft = message.conceptDraft;
  if (!draft) return [];
  const body =
    draft.body?.trim() ||
    draft.text?.trim() ||
    draft.preview?.trim() ||
    "";
  return [
    "",
    "--- Existing reply draft (already open on this thread) ---",
    `From: ${draft.from?.trim() || "(inbox)"}`,
    `To: ${draft.to.filter(Boolean).join(", ") || "(not set)"}`,
    `Subject: ${draft.subject?.trim() || "(no subject)"}`,
    "",
    body || "(empty draft body)",
    "--- End existing reply draft ---",
  ];
}

function resolveEmailThreadKeyForAgent(
  message: AgentMailMessageDetail,
): string {
  return message.threadId?.trim() || message.messageId;
}

function formatEmailIndexCard(message: AgentMailMessageDetail): string[] {
  return [
    "--- Email index ---",
    `From: ${message.from || "Unknown sender"}`,
    `To: ${message.inboxEmail?.trim() || "(inbox)"}`,
    `Subject: ${message.subject?.trim() || "(no subject)"}`,
    `Received: ${formatEmailReceivedForAgent(message.timestamp)}`,
    `Inbox id: ${message.inboxId}`,
    `Message id: ${message.messageId}`,
    `Thread key: ${resolveEmailThreadKeyForAgent(message)}`,
    "--- End email index ---",
  ];
}

function formatApiPointers(message: AgentMailMessageDetail): string[] {
  const inboxId = encodeURIComponent(message.inboxId);
  const messageId = encodeURIComponent(message.messageId);
  const threadKey = encodeURIComponent(resolveEmailThreadKeyForAgent(message));
  return [
    "",
    "--- Load more only if needed ---",
    "Prefer earlier turns in THIS agent session for body/comments already provided.",
    "If something is missing or may have changed, fetch from local BacksterOS core:",
    `GET /api/v1/email/inboxes/${inboxId}/messages/${messageId}`,
    "  → full message body, headers, conceptDraft, threadMetadata, threadComments",
    `GET /api/v1/email/inboxes/${inboxId}/threads/${threadKey}/comments`,
    "  → timeline comments only",
    "Use the same Bearer auth the desktop agent uses for BacksterOS. Skip tools when the index or session history already answers the question.",
    "--- End load more ---",
  ];
}

function formatCommentSummary(
  comments: readonly EmailThreadComment[] | null | undefined,
): string[] {
  const rows = (comments ?? []).filter((comment) => comment.body?.trim());
  if (rows.length === 0) {
    return ["", "Timeline comments: none yet."];
  }
  const latest = rows[rows.length - 1];
  const preview = latest?.body?.trim().replace(/\s+/g, " ").slice(0, 120) ?? "";
  return [
    "",
    `Timeline comments: ${rows.length} on this thread.`,
    preview
      ? `Latest comment preview: ${preview}${preview.length >= 120 ? "…" : ""}`
      : "",
  ].filter(Boolean);
}

function formatDraftSummary(message: AgentMailMessageDetail): string[] {
  const draft = message.conceptDraft;
  if (!draft) return ["", "Reply draft: none open."];
  return [
    "",
    "Reply draft: open on this thread (fetch message detail if you need the full draft text).",
    `Draft subject: ${draft.subject?.trim() || "(no subject)"}`,
  ];
}

const EMAIL_AGENT_SHARED_RULES = [
  "You are helping with an email thread in BacksterOS via timeline comments.",
  "",
  "Rules:",
  "- Default: respond in natural language only. Your whole reply becomes a timeline comment.",
  "- Do not include subject, To/Cc lines, or markdown wrappers around the comment.",
  "- Answer factual questions from the email index below and from earlier turns in this session when possible.",
  "- Do not re-ask for information already in the index or session history.",
  "- When the user asks you to draft or create a reply email:",
  "  - Output ONLY one machine block with the reply body (no greeting/sign-off).",
  "  - Do NOT write any other text — no acknowledgment, summary, or timeline comment.",
  "  - BacksterOS materializes the draft; a comment is not needed.",
  "  - Do NOT call APIs, tools, or MCP to create/update/send drafts — only the REPLY_DRAFT block.",
  "```REPLY_DRAFT",
  "...reply body only...",
  "```",
  "- Ground drafts in the inbound email and thread discussion.",
  "- Do not put the REPLY_DRAFT block unless the user asked for a draft/reply.",
  "- Greeting and sign-off are added by BacksterOS — omit them from REPLY_DRAFT.",
];

export type EmailAgentContextDepth = "full" | "lean";

/**
 * `full` — session bootstrap: include body, comments, draft (once).
 * `lean` — follow-ups: tiny index + API pointers; rely on session history.
 */
export function buildEmailAgentHiddenContext(
  message: AgentMailMessageDetail,
  options?: { depth?: EmailAgentContextDepth },
): string {
  const depth = options?.depth ?? "full";
  const assigneeLabel =
    message.threadMetadata?.assigneeName?.trim() || "Assignee";

  if (depth === "lean") {
    return [
      ...EMAIL_AGENT_SHARED_RULES,
      "- This is a follow-up. Do NOT expect a full email dump here — use session history, then fetch via the GET paths if needed.",
      "",
      ...formatEmailIndexCard(message),
      ...formatThreadMetadata(message),
      ...formatCommentSummary(message.threadComments),
      ...formatDraftSummary(message),
      ...formatApiPointers(message),
    ].join("\n");
  }

  const threadMessages =
    message.threadMessages && message.threadMessages.length > 0
      ? message.threadMessages
      : null;
  const bodySection = threadMessages
    ? [
        "--- Thread messages (oldest → newest) ---",
        ...threadMessages.flatMap((entry, index) => [
          "",
          `### Message ${index + 1} (${entry.messageId})`,
          `From: ${entry.from}`,
          `To: ${entry.to.join(", ") || "(none)"}`,
          `Received / sent: ${entry.timestamp}`,
          emailMessageBody(entry) || "(no text body)",
        ]),
        "--- End thread messages ---",
      ]
    : [
        "--- Email body ---",
        emailMessageBody(message) || "(no text body)",
        "--- End email body ---",
      ];
  const commentsSection = formatCommentHistory(
    message.threadComments,
    assigneeLabel,
  );

  return [
    ...EMAIL_AGENT_SHARED_RULES,
    "- This bootstrap includes the full thread snapshot for this session. Later turns will be lean — remember what you read here.",
    "",
    ...formatEmailIndexCard(message),
    "",
    ...bodySection,
    ...formatThreadMetadata(message),
    ...commentsSection,
    ...formatExistingDraft(message),
    ...formatApiPointers(message),
  ].join("\n");
}

export function buildEmailAgentAcpPrompt(
  userPrompt: string,
  message: AgentMailMessageDetail,
  options?: { depth?: EmailAgentContextDepth },
): string {
  return `${buildEmailAgentHiddenContext(message, options)}\n\n--- User request ---\n${userPrompt.trim()}`;
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
    /* ignore */
  }
}
