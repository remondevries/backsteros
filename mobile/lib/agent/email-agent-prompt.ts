/**
 * Email agent prompt helpers — compose + thread comment / CREATE_TASK / TASK_CARD.
 * Chat-id persistence: `email-agent-chat-id.ts`.
 */

import type { AgentMailMessageDetail, EmailThreadComment } from "@backsteros/contracts";

import { emailMessagePlainBody } from "../email-message-html";

const GREETING_LINE =
  /^(?:hi|hello|hey|dear|aan|beste|geachte|goedemorgen|goedemiddag|goedenavond)\b[^,\n]{0,80},?\s*$/i;

const SIGN_OFF_BLOCK =
  /\n+(?:best|thanks|thank you|sincerely|regards|cheers|groeten|met vriendelijke groet|vriendelijke groet|hartelijke groet|mvg|kind regards|best regards),?\s*\n[\s\S]*$/i;

/** Strip greeting/sign-off shell the model often still emits. */
export function extractAgentReplyBody(text: string): string {
  let body = text.trim();
  if (!body) return "";

  const shellMatch = body.match(
    /^ *(?:hi|hello|hey|dear|aan|beste|geachte)\s+[^,\n]{1,80},?\s*\n+([\s\S]*?)\n+(?:best|groeten|met vriendelijke groet|vriendelijke groet|hartelijke groet|mvg|kind regards|best regards|cheers|thanks|sincerely),?\s*\n[\s\S]*$/i,
  );
  if (shellMatch?.[1]) body = shellMatch[1].trim();

  const lines = body.split("\n");
  while (lines.length > 0 && GREETING_LINE.test(lines[0]?.trim() ?? "")) {
    lines.shift();
  }
  body = lines.join("\n").trim();

  body = body.replace(SIGN_OFF_BLOCK, "");
  body = body.replace(/^(?:aan|beste|geachte),?\s*\n+/i, "");

  const blocks = body
    .split(/\n\s*\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (blocks.length > 1) {
    body = blocks[blocks.length - 1] ?? body;
  }

  return body.trim();
}

export type EmailComposeContext = {
  fromEmail: string;
  to: string;
  subject: string;
  /** When revising an open draft, include the editable middle. */
  currentDraftBody?: string;
};

export function buildEmailComposeAgentHiddenContext(
  context: EmailComposeContext,
): string {
  const current = context.currentDraftBody?.trim() ?? "";
  const revising = current.length > 0;

  return [
    revising
      ? "You are revising a concept reply draft in BacksterOS."
      : "You are helping draft new emails in BacksterOS.",
    "",
    "Rules:",
    revising
      ? "- The user is editing a draft. Treat their message as a direct instruction to change the draft body."
      : "- When asked to draft an email, output ONLY the message body.",
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
    ...(revising
      ? [
          "",
          "--- Current draft body (editable middle only) ---",
          current,
          "--- End current draft body ---",
        ]
      : []),
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

const CREATE_TASK_BLOCK =
  /```CREATE_TASK\s*\n([\s\S]*?)```/gi;

const TASK_CARD_BLOCK =
  /```TASK_CARD\s*\n([\s\S]*?)```/i;

export type EmailAgentCreateTaskSpec = {
  title: string;
  description?: string | null;
  dueDate?: string | null;
  priority?: number | null;
  projectKey?: string | null;
  status?: string | null;
  inbox?: boolean | null;
};

export type EmailAgentTaskCardPayload = {
  taskId: string;
  number: number | null;
  title: string;
  displayId?: string | null;
  projectKey?: string | null;
  projectName?: string | null;
  projectIcon?: string | null;
  dueDate?: string | null;
  status?: string | null;
  priority?: number | null;
  href: string;
};

export type ParsedEmailAgentCommentResponse = {
  /** Natural-language comment shown in the timeline (fences stripped). */
  commentBody: string;
  /** Optional reply body to materialize as a concept draft. */
  replyDraftBody: string | null;
  /** Tasks the agent asked BacksterOS to create. */
  createTasks: EmailAgentCreateTaskSpec[];
};

function normalizeAgentDueDate(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const text = String(raw).trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return `${text}T12:00:00.000Z`;
  }
  const ms = Date.parse(text);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

function parseCreateTaskSpec(raw: string): EmailAgentCreateTaskSpec | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const title =
      typeof parsed.title === "string" ? parsed.title.trim() : "";
    if (!title) return null;
    const priorityRaw = parsed.priority;
    const priority =
      typeof priorityRaw === "number" && Number.isFinite(priorityRaw)
        ? Math.max(0, Math.min(4, Math.round(priorityRaw)))
        : null;
    return {
      title,
      description:
        typeof parsed.description === "string"
          ? parsed.description.trim() || null
          : null,
      dueDate: normalizeAgentDueDate(parsed.dueDate),
      priority,
      projectKey:
        typeof parsed.projectKey === "string"
          ? parsed.projectKey.trim() || null
          : null,
      status:
        typeof parsed.status === "string"
          ? parsed.status.trim() || null
          : null,
      inbox:
        typeof parsed.inbox === "boolean" ? parsed.inbox : null,
    };
  } catch {
    return null;
  }
}

export function parseEmailAgentTaskCard(
  body: string,
): { card: EmailAgentTaskCardPayload; note: string } | null {
  const match = body.match(TASK_CARD_BLOCK);
  if (!match?.[1]) return null;
  try {
    const parsed = JSON.parse(match[1].trim()) as Record<string, unknown>;
    const taskId = typeof parsed.taskId === "string" ? parsed.taskId.trim() : "";
    const title = typeof parsed.title === "string" ? parsed.title.trim() : "";
    const href = typeof parsed.href === "string" ? parsed.href.trim() : "";
    if (!taskId || !title || !href) return null;
    const number =
      typeof parsed.number === "number" && Number.isFinite(parsed.number)
        ? Math.round(parsed.number)
        : null;
    const priorityRaw = parsed.priority;
    const priority =
      typeof priorityRaw === "number" && Number.isFinite(priorityRaw)
        ? Math.max(0, Math.min(4, Math.round(priorityRaw)))
        : null;
    const note = body.replace(TASK_CARD_BLOCK, "").replace(/\n{3,}/g, "\n\n").trim();
    return {
      card: {
        taskId,
        number,
        title,
        displayId:
          typeof parsed.displayId === "string"
            ? parsed.displayId.trim() || null
            : null,
        projectKey:
          typeof parsed.projectKey === "string"
            ? parsed.projectKey.trim() || null
            : null,
        projectName:
          typeof parsed.projectName === "string"
            ? parsed.projectName.trim() || null
            : null,
        projectIcon:
          typeof parsed.projectIcon === "string"
            ? parsed.projectIcon.trim() || null
            : null,
        dueDate:
          typeof parsed.dueDate === "string" ? parsed.dueDate : null,
        status:
          typeof parsed.status === "string"
            ? parsed.status.trim() || null
            : null,
        priority,
        href,
      },
      note: note,
    };
  } catch {
    return null;
  }
}

export function formatEmailAgentTaskCardComment(
  card: EmailAgentTaskCardPayload,
  note?: string | null,
): string {
  const payload = {
    taskId: card.taskId,
    number: card.number,
    title: card.title,
    displayId: card.displayId ?? null,
    projectKey: card.projectKey ?? null,
    projectName: card.projectName ?? null,
    projectIcon: card.projectIcon ?? null,
    dueDate: card.dueDate ?? null,
    status: card.status ?? null,
    priority: card.priority ?? null,
    href: card.href,
  };
  const fence = `\`\`\`TASK_CARD\n${JSON.stringify(payload)}\n\`\`\``;
  const extra = note?.trim();
  return extra ? `${fence}\n\n${extra}` : fence;
}

/** Split agent output into timeline comment + optional machine blocks. */
export function parseEmailAgentCommentResponse(
  text: string,
): ParsedEmailAgentCommentResponse {
  const raw = text.trim();
  if (!raw) {
    return { commentBody: "", replyDraftBody: null, createTasks: [] };
  }

  const createTasks: EmailAgentCreateTaskSpec[] = [];
  let withoutCreate = raw;
  for (const match of raw.matchAll(CREATE_TASK_BLOCK)) {
    const spec = parseCreateTaskSpec(match[1] ?? "");
    if (spec) createTasks.push(spec);
  }
  withoutCreate = withoutCreate.replace(CREATE_TASK_BLOCK, "").trim();

  const replyMatch = withoutCreate.match(/```REPLY_DRAFT\s*\n([\s\S]*?)```/i);
  const replyDraftBody = replyMatch?.[1]?.trim() || null;
  if (replyDraftBody && createTasks.length === 0) {
    return { commentBody: "", replyDraftBody, createTasks: [] };
  }

  let commentBody = withoutCreate
    .replace(/```REPLY_DRAFT\s*\n[\s\S]*?```/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // Draft-only turns stay silent on the timeline.
  if (replyDraftBody && createTasks.length === 0) {
    commentBody = "";
  }

  return { commentBody, replyDraftBody, createTasks };
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

function extractAddressEmail(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "";
  const angle = trimmed.match(/<([^>]+)>/);
  if (angle?.[1]) return angle[1].trim().toLowerCase();
  return trimmed.toLowerCase();
}

type AgentThreadMessageRow = NonNullable<
  AgentMailMessageDetail["threadMessages"]
>[number];

function resolveThreadMessageRows(
  message: AgentMailMessageDetail,
): AgentThreadMessageRow[] {
  if (message.threadMessages && message.threadMessages.length > 0) {
    return message.threadMessages;
  }
  return [
    {
      messageId: message.messageId,
      threadId: message.threadId,
      subject: message.subject,
      from: message.from,
      to: message.to ?? (message.inboxEmail ? [message.inboxEmail] : []),
      timestamp: message.timestamp,
      text: message.text ?? null,
      html: message.html ?? null,
      extractedText: message.extractedText ?? null,
      extractedHtml: message.extractedHtml ?? null,
      labels: message.labels,
      inReplyTo: message.inReplyToMessageId ?? null,
    },
  ];
}

function isOutboundFromInbox(
  entry: { from: string },
  inboxEmail: string | null | undefined,
): boolean {
  const inbox = extractAddressEmail(inboxEmail);
  if (!inbox) return false;
  return extractAddressEmail(entry.from) === inbox;
}

/** Compact sent/received counts so lean follow-ups can answer “how many?”. */
function formatThreadCensus(message: AgentMailMessageDetail): string[] {
  const rows = resolveThreadMessageRows(message);
  let sent = 0;
  let received = 0;
  for (const entry of rows) {
    if (isOutboundFromInbox(entry, message.inboxEmail)) sent += 1;
    else received += 1;
  }
  const draftOpen = Boolean(
    message.conceptDraft?.draftId?.trim() || message.conceptDraftId?.trim(),
  );
  return [
    "",
    "--- Thread census ---",
    `Messages in this thread: ${rows.length} total (${sent} sent from this inbox, ${received} received).`,
    draftOpen
      ? "Open reply draft: 1 (not sent — never count drafts as sent emails)."
      : "Open reply draft: none.",
    "When the user asks how many emails were sent/received, answer from this census.",
    "--- End thread census ---",
  ];
}

function formatThreadMessageIndex(message: AgentMailMessageDetail): string[] {
  const rows = resolveThreadMessageRows(message);
  return [
    "",
    "--- Thread message index (oldest → newest) ---",
    ...rows.map((entry, index) => {
      const direction = isOutboundFromInbox(entry, message.inboxEmail)
        ? "sent"
        : "received";
      return `${index + 1}. [${direction}] ${entry.from} → ${
        entry.to.filter(Boolean).join(", ") || "(none)"
      } · ${formatEmailReceivedForAgent(entry.timestamp)} · ${
        entry.subject?.trim() || "(no subject)"
      }`;
    }),
    "--- End thread message index ---",
  ];
}

function formatEmailIndexCard(message: AgentMailMessageDetail): string[] {
  return [
    "--- Email index ---",
    `Focused message from: ${message.from || "Unknown sender"}`,
    `Inbox: ${message.inboxEmail?.trim() || "(inbox)"}`,
    `Subject: ${message.subject?.trim() || "(no subject)"}`,
    `Timestamp: ${formatEmailReceivedForAgent(message.timestamp)}`,
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
  "- Answer factual questions from the thread census / message index below and from earlier turns in this session when possible.",
  "- Sent = outbound from this inbox. Received = inbound to this inbox. Open drafts are not sent.",
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
  "- When the user asks you to create a task / to-do from this email:",
  "  - Output one or more CREATE_TASK machine blocks (JSON). BacksterOS creates the tasks.",
  "  - You may also write a short timeline comment outside the blocks.",
  "  - Do NOT call APIs, tools, or MCP to create tasks — only CREATE_TASK blocks.",
  "  - Prefer copying contact/project context from thread metadata when relevant.",
  "  - dueDate: ISO datetime or YYYY-MM-DD. priority: 0–4 (0 = none).",
  "```CREATE_TASK",
  '{"title":"Follow up on invoice","dueDate":"2026-08-25","priority":2,"description":"optional","projectKey":null,"inbox":true}',
  "```",
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
      "- This is a follow-up. Do NOT expect a full email dump here — use the census/index below, session history, then fetch via the GET paths if needed.",
      "",
      ...formatEmailIndexCard(message),
      ...formatThreadCensus(message),
      ...formatThreadMessageIndex(message),
      ...formatThreadMetadata(message),
      ...formatCommentSummary(message.threadComments),
      ...formatDraftSummary(message),
      ...formatApiPointers(message),
    ].join("\n");
  }

  const threadMessages = resolveThreadMessageRows(message);
  const bodySection = [
    "--- Thread messages (oldest → newest) ---",
    ...threadMessages.flatMap((entry, index) => {
      const direction = isOutboundFromInbox(entry, message.inboxEmail)
        ? "sent"
        : "received";
      return [
        "",
        `### Message ${index + 1} [${direction}] (${entry.messageId})`,
        `From: ${entry.from}`,
        `To: ${entry.to.join(", ") || "(none)"}`,
        `Received / sent: ${entry.timestamp}`,
        emailMessagePlainBody(entry) || "(no text body)",
      ];
    }),
    "--- End thread messages ---",
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
    ...formatThreadCensus(message),
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

/** User is editing the concept draft — revise body only, never timeline comments. */
export type EmailAgentPromptIntent = "comment" | "revise-draft";

export function buildEmailDraftReviseAgentHiddenContext(
  message: AgentMailMessageDetail,
  draftBody: string,
): string {
  return [
    "You are revising a concept reply draft in BacksterOS.",
    "",
    "Rules:",
    "- The user is in draft edit mode. Treat their message as a direct instruction to change the draft body.",
    "- Output ONLY one machine block with the full revised body (no greeting/sign-off).",
    "- Do NOT write any other text — no acknowledgment, summary, or timeline comment.",
    "- Do NOT call APIs, tools, or MCP — only the REPLY_DRAFT block.",
    "```REPLY_DRAFT",
    "...full revised body only...",
    "```",
    "- Greeting and sign-off are added by BacksterOS — omit them from REPLY_DRAFT.",
    "- Keep grounding in the inbound email when relevant.",
    "",
    ...formatEmailIndexCard(message),
    "",
    "--- Current draft body (editable middle only) ---",
    draftBody.trim() || "(empty)",
    "--- End current draft body ---",
    "",
    "--- Inbound email (for grounding) ---",
    emailMessagePlainBody(message) || "(no text body)",
    "--- End inbound email ---",
  ].join("\n");
}

export function buildEmailDraftReviseAgentAcpPrompt(
  userPrompt: string,
  message: AgentMailMessageDetail,
  draftBody: string,
): string {
  return `${buildEmailDraftReviseAgentHiddenContext(message, draftBody)}\n\n--- User request ---\n${userPrompt.trim()}`;
}

