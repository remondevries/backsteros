import { z } from "zod";

import { TASK_STATUSES } from "./common.js";
/** AgentMail integration (API key + inbox). */
export const agentMailInboxSchema = z.object({
  inboxId: z.string(),
  email: z.string(),
  displayName: z.string().nullable(),
  podId: z.string().nullable(),
  contactId: z.string().nullable().optional(),
  contactName: z.string().nullable().optional(),
});

export const agentMailSettingsSchema = z.object({
  apiKeyConfigured: z.boolean(),
  apiKeyPreview: z.string().nullable(),
  /** First selected inbox — kept for older clients. */
  inboxId: z.string().nullable(),
  inboxEmail: z.string().nullable(),
  inboxDisplayName: z.string().nullable(),
  inboxIds: z.array(z.string()),
  inboxes: z.array(agentMailInboxSchema),
  organizationId: z.string().nullable(),
  connected: z.boolean(),
  replyGreetingTemplate: z.string(),
  replyGreetingTemplateEn: z.string(),
  replyGreetingTemplateNl: z.string(),
  replySignOffTemplateEn: z.string(),
  replySignOffTemplateNl: z.string(),
  webhookConfigured: z.boolean(),
  /** Grok Bot webhook URL for email concept drafts. */
  grokWebhookConfigured: z.boolean(),
  grokWebhookUrlPreview: z.string().nullable(),
});

export const updateAgentMailSettingsSchema = z.object({
  /** Set to a new key, or empty string to clear. Omit to leave unchanged. */
  apiKey: z.string().optional(),
  /** Set to an inbox id, or null/empty to clear. Omit to leave unchanged. */
  inboxId: z.string().nullable().optional(),
  /** Replace the selected inbox list. Empty array clears selection. */
  inboxIds: z.array(z.string()).optional(),
  /** @deprecated Prefer replyGreetingTemplateEn. */
  replyGreetingTemplate: z.string().max(500).optional(),
  replyGreetingTemplateEn: z.string().max(500).optional(),
  replyGreetingTemplateNl: z.string().max(500).optional(),
  replySignOffTemplateEn: z.string().max(500).optional(),
  replySignOffTemplateNl: z.string().max(500).optional(),
  /** Merge inbox id → contact id (null clears). Only selected inboxes are kept. */
  inboxContacts: z
    .record(z.string().min(1), z.string().min(1).nullable())
    .optional(),
  /** Grok Bot routine URL. Empty string clears. Omit to leave unchanged. */
  grokWebhookUrl: z.string().max(2000).optional(),
  /** Grok Bot webhook key/token. Empty string clears. Omit to leave unchanged. */
  grokWebhookKey: z.string().max(2000).optional(),
});

export const agentMailInboxesResponseSchema = z.object({
  inboxes: z.array(agentMailInboxSchema),
});

export const agentMailTestConnectionResultSchema = z.object({
  ok: z.boolean(),
  error: z.string().nullable(),
  organizationId: z.string().nullable(),
  inboxEmail: z.string().nullable(),
  inboxCount: z.number().int().nullable(),
});

export const autoReviewWebhookRecentFailureSchema = z.object({
  deliveryId: z.string(),
  taskId: z.string().nullable(),
  taskKey: z.string().nullable(),
  at: z.string().datetime(),
  error: z.string().nullable(),
  httpStatus: z.number().int().nullable(),
  attempt: z.number().int(),
});

export const autoReviewWebhookSettingsSchema = z.object({
  enabled: z.boolean(),
  url: z.string().nullable(),
  secretConfigured: z.boolean(),
  /** Masked HMAC signing secret (never the raw value). */
  secretPreview: z.string().nullable(),
  /** Optional Grok Bot / receiver Authorization header is configured. */
  authorizationHeaderConfigured: z.boolean(),
  /** Masked Authorization header value (last four; never the raw value). */
  authorizationHeaderPreview: z.string().nullable(),
  lastDeliveryAt: z.string().datetime().nullable(),
  lastDeliveryResult: z.enum(["delivered", "failed", "pending"]).nullable(),
  lastDeliveryHttpStatus: z.number().int().nullable(),
  lastDeliveryError: z.string().nullable(),
  recentFailures: z.array(autoReviewWebhookRecentFailureSchema),
});

export const updateAutoReviewWebhookSettingsSchema = z.object({
  url: z.string().max(2000).optional(),
  /** New HMAC signing secret, or empty string to clear. Omit to leave unchanged. */
  secret: z.string().max(2000).optional(),
  /**
   * Full Authorization header value for the receiver (e.g. "Bearer …"), or empty
   * string to clear. Distinct from the HMAC signing secret. Omit to leave unchanged.
   */
  authorizationHeader: z.string().max(2000).optional(),
  enabled: z.boolean().optional(),
});

export const autoReviewWebhookTestResultSchema = z.object({
  ok: z.boolean(),
  error: z.string().nullable(),
  httpStatus: z.number().int().nullable(),
  deliveryId: z.string().nullable(),
});

export const agentMailListItemKindSchema = z.enum(["message", "draft"]);

/**
 * Email thread statuses include task statuses plus draft-only `concept`.
 * Kept separate from TASK_STATUSES so task pickers/filters never accept concept.
 */
export const EMAIL_THREAD_STATUSES = [...TASK_STATUSES, "concept"] as const;

export const emailThreadStatusSchema = z.enum(EMAIL_THREAD_STATUSES);

/** One or more email addresses (string or list) for draft headers. */
const emailRecipientListSchema = z
  .union([
    z.string().max(2_000),
    z.array(z.string().min(1).max(320)).max(50),
  ])
  .optional();

export const agentMailConceptDraftSchema = z.object({
  draftId: z.string(),
  inboxId: z.string(),
  subject: z.string().nullable(),
  from: z.string().nullable(),
  to: z.array(z.string()),
  cc: z.array(z.string()).optional(),
  bcc: z.array(z.string()).optional(),
  /** Full assembled draft text stored in AgentMail. */
  text: z.string().nullable(),
  /** Editable body without greeting/sign-off. */
  body: z.string().nullable(),
  greeting: z.string().nullable(),
  signOff: z.string().nullable(),
  preview: z.string().nullable(),
  updatedAt: z.string(),
});

export const agentMailMessageSchema = z.object({
  kind: agentMailListItemKindSchema.default("message"),
  inboxId: z.string(),
  threadId: z.string().optional(),
  messageId: z.string(),
  draftId: z.string().nullable().optional(),
  inReplyToMessageId: z.string().nullable().optional(),
  conceptDraftId: z.string().nullable().optional(),
  conceptPreview: z.string().nullable().optional(),
  subject: z.string(),
  from: z.string(),
  /** Recipients when the list/detail payload includes them (AgentMail). */
  to: z.array(z.string()).optional(),
  preview: z.string().nullable(),
  timestamp: z.string(),
  /** Workspace email thread row id (when registered). */
  emailThreadId: z.string().optional(),
  /** Workspace-wide display number (E-1, E-2, …). */
  number: z.number().int().positive().optional(),
  displayId: z.string().optional(),
  /** Workspace thread property; defaults to backlog when unset. */
  status: emailThreadStatusSchema.optional(),
  priority: z.number().int().min(0).max(4).optional(),
  dueDate: z.string().datetime().nullable().optional(),
  organizationId: z.string().nullable().optional(),
  organizationName: z.string().nullable().optional(),
  contactId: z.string().nullable().optional(),
  contactName: z.string().nullable().optional(),
  /**
   * Distinct linked contacts across the thread’s per-message parties — used
   * for multi-party avatar stacks on Communication list cards.
   */
  partyContactIds: z.array(z.string()).optional(),
  assigneeId: z.string().nullable().optional(),
  assigneeName: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  projectName: z.string().nullable().optional(),
  projectKey: z.string().nullable().optional(),
  /** External update flag — surfaces in the Updated inbox group. */
  inboxUpdatedAt: z.string().datetime().nullable().optional(),
  /** AgentMail labels (e.g. unread / read). */
  labels: z.array(z.string()).optional(),
});

export const agentMailMessagesResponseSchema = z.object({
  messages: z.array(agentMailMessageSchema),
});

export const emailThreadMessagePartySchema = z.object({
  contactId: z.string().nullable(),
  organizationId: z.string().nullable(),
});

export const emailThreadMessagePartiesSchema = z.record(
  z.string(),
  emailThreadMessagePartySchema,
);

export const emailThreadMetadataSchema = z.object({
  id: z.string(),
  inboxId: z.string(),
  threadKey: z.string(),
  number: z.number().int().positive(),
  displayId: z.string(),
  organizationId: z.string().nullable(),
  organizationName: z.string().nullable().optional(),
  contactId: z.string().nullable(),
  contactName: z.string().nullable().optional(),
  assigneeId: z.string().nullable(),
  assigneeName: z.string().nullable().optional(),
  projectId: z.string().nullable(),
  projectName: z.string().nullable().optional(),
  projectKey: z.string().nullable().optional(),
  /** Per AgentMail messageId → contact/org for that message. */
  messageParties: emailThreadMessagePartiesSchema.optional(),
  status: emailThreadStatusSchema,
  priority: z.number().int().min(0).max(4),
  dueDate: z.string().datetime().nullable(),
  /** External update flag — surfaces in the Updated inbox group. */
  inboxUpdatedAt: z.string().datetime().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const updateEmailThreadMetadataSchema = z.object({
  organizationId: z.string().nullable().optional(),
  contactId: z.string().nullable().optional(),
  assigneeId: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  status: emailThreadStatusSchema.optional(),
  priority: z.number().int().min(0).max(4).optional(),
  dueDate: z.string().datetime().nullable().optional(),
  /**
   * Merge map of messageId → party. Existing keys not listed are kept;
   * listed keys are replaced.
   */
  messageParties: emailThreadMessagePartiesSchema.optional(),
  /** Upsert a single message party (merged into messageParties). */
  messageParty: z
    .object({
      messageId: z.string().min(1),
      contactId: z.string().nullable().optional(),
      organizationId: z.string().nullable().optional(),
    })
    .optional(),
  /** Clear the Updated inbox flag after the user views the item. */
  acknowledgeInboxUpdate: z.boolean().optional(),
  inboxUpdatedAt: z.string().datetime().nullable().optional(),
});

export const emailThreadCommentAuthorSchema = z.enum(["user", "agent"]);

export const emailThreadCommentSchema = z.object({
  id: z.string(),
  emailThreadId: z.string(),
  body: z.string(),
  author: emailThreadCommentAuthorSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const createEmailThreadCommentSchema = z.object({
  body: z.string().min(1).max(100_000),
  author: emailThreadCommentAuthorSchema.optional(),
});

export const updateEmailThreadCommentSchema = z.object({
  body: z.string().min(1).max(100_000),
});

export const emailThreadCommentsResponseSchema = z.object({
  comments: z.array(emailThreadCommentSchema),
});

export const agentMailMessageAttachmentSchema = z.object({
  attachmentId: z.string(),
  size: z.number().int().nonnegative().optional(),
  filename: z.string().nullable().optional(),
  contentType: z.string().nullable().optional(),
  contentDisposition: z.string().nullable().optional(),
  contentId: z.string().nullable().optional(),
});

export const agentMailMessageDetailSchema = agentMailMessageSchema
  .omit({ kind: true, draftId: true, inReplyToMessageId: true })
  .extend({
    kind: agentMailListItemKindSchema.default("message"),
    draftId: z.string().nullable().optional(),
    inReplyToMessageId: z.string().nullable().optional(),
    text: z.string().nullable(),
    html: z.string().nullable(),
    extractedText: z.string().nullable(),
    extractedHtml: z.string().nullable(),
    to: z.array(z.string()).optional(),
    cc: z.array(z.string()).optional(),
    labels: z.array(z.string()).optional(),
    attachments: z.array(agentMailMessageAttachmentSchema).optional(),
    inboxEmail: z.string().nullable().optional(),
    conceptDraft: agentMailConceptDraftSchema.nullable().optional(),
    threadMetadata: emailThreadMetadataSchema.optional(),
    threadComments: z.array(emailThreadCommentSchema).optional(),
    /** All messages in the AgentMail thread (oldest → newest when present). */
    threadMessages: z
      .array(
        z.object({
          messageId: z.string(),
          threadId: z.string().optional(),
          subject: z.string(),
          from: z.string(),
          to: z.array(z.string()),
          cc: z.array(z.string()).optional(),
          timestamp: z.string(),
          text: z.string().nullable(),
          html: z.string().nullable(),
          extractedText: z.string().nullable(),
          extractedHtml: z.string().nullable(),
          labels: z.array(z.string()).optional(),
          inReplyTo: z.string().nullable().optional(),
          attachments: z.array(agentMailMessageAttachmentSchema).optional(),
        }),
      )
      .optional(),
  });

export const agentMailDraftDetailSchema = z.object({
  inboxId: z.string(),
  draftId: z.string(),
  subject: z.string().nullable(),
  preview: z.string().nullable(),
  text: z.string().nullable(),
  body: z.string().nullable().optional(),
  greeting: z.string().nullable().optional(),
  signOff: z.string().nullable().optional(),
  html: z.string().nullable(),
  inReplyTo: z.string().nullable(),
  from: z.string().nullable().optional(),
  to: z.array(z.string()),
  cc: z.array(z.string()).optional(),
  bcc: z.array(z.string()).optional(),
  updatedAt: z.string(),
  createdAt: z.string(),
});

export const emailConceptReplyInputSchema = z.object({
  body: z.string().min(1).max(100_000),
  /** Override reply To (defaults from the inbound From / reply party). */
  to: emailRecipientListSchema,
  /** CC recipients for this reply draft. */
  cc: emailRecipientListSchema,
  subject: z.string().max(500).optional(),
});

export const emailConceptReplyResponseSchema = z.object({
  draftId: z.string(),
  inboxId: z.string(),
  inReplyToMessageId: z.string(),
  /** Editable body without greeting/sign-off. */
  body: z.string().nullable().optional(),
  greeting: z.string().nullable().optional(),
  signOff: z.string().nullable().optional(),
  subject: z.string().nullable().optional(),
  to: z.array(z.string()).optional(),
  cc: z.array(z.string()).optional(),
});

/** Intents the email-thread agent may return via callback. */
export const emailAgentIntentSchema = z.enum([
  "reply_draft",
  "task",
  "calendar",
  "note",
]);

export type EmailAgentIntent = z.infer<typeof emailAgentIntentSchema>;

export const emailAgentDraftInputSchema = z.object({
  /** User instruction for Grok (not the finished email). */
  prompt: z.string().min(1).max(20_000),
  /**
   * When set, Grok must use this intent (no classification).
   * Reply UI always sends `reply_draft`.
   */
  intent: emailAgentIntentSchema.optional(),
  /**
   * Editable concept-draft body already known on the client.
   * When present (including null), the server skips the AgentMail draft scan.
   */
  currentDraftBody: z.string().max(100_000).nullable().optional(),
});

export const emailAgentCallbackTaskPayloadSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(10_000).nullable().optional(),
  projectKey: z.string().min(1).max(64).nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  /** Filled by core after create (poll response). */
  taskId: z.string().min(1).max(64).optional(),
});

export const emailAgentCallbackEventPayloadSchema = z.object({
  title: z.string().min(1).max(500),
  start: z.string().datetime(),
  end: z.string().datetime(),
  notes: z.string().max(100_000).nullable().optional(),
  /** Filled by core after create (poll response). */
  meetingId: z.string().min(1).max(64).optional(),
});

/**
 * Success callback from Judith / Grok Bot.
 * Legacy `{ ok, requestId, body }` (no intent) is treated as `reply_draft`.
 */
export const emailAgentCallbackSuccessSchema = z
  .object({
    ok: z.literal(true),
    requestId: z.string().min(1).max(128),
    intent: emailAgentIntentSchema.optional(),
    /** Body-only email text (no greeting/sign-off) for reply_draft. */
    body: z.string().min(1).max(100_000).optional(),
    draftId: z.string().min(1).max(200).optional(),
    inboxId: z.string().min(1).max(200).optional(),
    /** Filled by core after upserting the concept reply. */
    greeting: z.string().max(2_000).nullable().optional(),
    signOff: z.string().max(2_000).nullable().optional(),
    subject: z.string().max(1_000).nullable().optional(),
    to: z.array(z.string().min(1).max(320)).max(50).optional(),
    cc: z.array(z.string().min(1).max(320)).max(50).optional(),
    task: emailAgentCallbackTaskPayloadSchema.optional(),
    event: emailAgentCallbackEventPayloadSchema.optional(),
    /** Agent-visible note for intent=note (posted as thread comment). */
    message: z.string().min(1).max(20_000).optional(),
  })
  .superRefine((value, ctx) => {
    const intent =
      value.intent ?? (value.body?.trim() ? "reply_draft" : undefined);
    if (!intent) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "intent is required (or provide body for reply_draft)",
      });
      return;
    }
    if (intent === "reply_draft" && !value.body?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["body"],
        message: "body is required for reply_draft",
      });
    }
    if (intent === "task" && !value.task?.title?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["task", "title"],
        message: "task.title is required for task intent",
      });
    }
    if (intent === "calendar") {
      if (!value.event?.title?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["event", "title"],
          message: "event.title is required for calendar intent",
        });
      }
      if (!value.event?.start) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["event", "start"],
          message: "event.start is required for calendar intent",
        });
      }
      if (!value.event?.end) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["event", "end"],
          message: "event.end is required for calendar intent",
        });
      }
    }
    if (intent === "note" && !value.message?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["message"],
        message: "message is required for note intent",
      });
    }
  });

export const emailAgentCallbackFailureSchema = z.object({
  ok: z.literal(false),
  requestId: z.string().min(1).max(128),
  error: z.string().min(1).max(2000),
});

export const emailAgentCallbackResultSchema = z.union([
  emailAgentCallbackSuccessSchema,
  emailAgentCallbackFailureSchema,
]);

export const emailAgentCallbackPollSchema = z.object({
  pending: z.boolean(),
  result: emailAgentCallbackResultSchema.optional(),
});

/** Fixed intents core can apply without waking Judith (OS-94). */
export const emailAgentCoreActionSchema = z.enum([
  "spam",
  "trash",
  "archive",
  "mark_read",
  "mark_unread",
  "task",
  "calendar",
  "note",
]);

export type EmailAgentCoreAction = z.infer<typeof emailAgentCoreActionSchema>;

/**
 * agent-draft start response. When `applied` is set, core already executed the
 * command — clients must not poll for a Judith callback.
 */
export const emailAgentDraftStartedSchema = z.object({
  requestId: z.string(),
  language: z.enum(["en", "nl"]),
  applied: z
    .object({
      intent: emailAgentCoreActionSchema,
      /** Wall time for classify+execute (desktop before/after timing). */
      durationMs: z.number().nonnegative(),
      /** Present for task / calendar / note creates. */
      result: emailAgentCallbackResultSchema.optional(),
      blockedSender: z.string().nullable().optional(),
    })
    .optional(),
});

export const emailComposeDraftInputSchema = z.object({
  /** String or list — mobile/desktop may send either. */
  to: z.union([
    z.string().min(1).max(2_000),
    z.array(z.string().min(1).max(320)).min(1).max(50),
  ]),
  cc: emailRecipientListSchema,
  bcc: emailRecipientListSchema,
  subject: z.string().max(500),
  body: z.string().min(1).max(100_000),
  composeSessionId: z.string().min(1).max(200).optional(),
});

/**
 * Agent-friendly one-shot: start a new email thread (compose + send).
 * Use dryRun/validate to preview without calling AgentMail.
 */
export const emailStartThreadInputSchema = z.object({
  inboxId: z.string().min(1),
  to: z.union([
    z.string().min(1).max(2_000),
    z.array(z.string().min(1).max(320)).min(1).max(50),
  ]),
  cc: emailRecipientListSchema,
  bcc: emailRecipientListSchema,
  subject: z.string().min(1).max(500),
  body: z.string().min(1).max(100_000),
  /** Optional BacksterOS contact to link on the local email thread metadata. */
  contactId: z.string().min(1).optional(),
  dryRun: z.boolean().optional(),
  validate: z.boolean().optional(),
});

export const emailStartThreadDryRunSchema = z.object({
  dryRun: z.literal(true),
  inboxId: z.string(),
  to: z.array(z.string()),
  cc: z.array(z.string()),
  bcc: z.array(z.string()),
  subject: z.string(),
  body: z.string(),
  contactId: z.string().nullable(),
});

export const emailComposeDraftResponseSchema = z.object({
  draftId: z.string(),
  inboxId: z.string(),
  composeSessionId: z.string(),
});

export const emailSendDraftResponseSchema = z.object({
  inboxId: z.string(),
  messageId: z.string(),
  threadId: z.string().optional(),
  subject: z.string(),
  inReplyToMessageId: z.string().nullable().optional(),
});

export const emailStartThreadResponseSchema = z.union([
  emailStartThreadDryRunSchema,
  emailSendDraftResponseSchema.extend({
    draftId: z.string().optional(),
    contactId: z.string().nullable().optional(),
  }),
]);

export const emailDeleteDraftResponseSchema = z.object({
  inboxId: z.string(),
  draftId: z.string(),
});

export const emailDeleteMessageResponseSchema = z.object({
  ok: z.literal(true),
});

export const emailReportSpamResponseSchema = z.object({
  ok: z.literal(true),
  blockedSender: z.string().nullable(),
});

export const updateAgentMailDraftSchema = z
  .object({
    /** Editable body without greeting/sign-off. */
    body: z.string().max(100_000).optional(),
    to: emailRecipientListSchema,
    cc: emailRecipientListSchema,
    bcc: emailRecipientListSchema,
    subject: z.string().max(500).optional(),
  })
  .refine(
    (value) =>
      value.body !== undefined ||
      value.to !== undefined ||
      value.cc !== undefined ||
      value.bcc !== undefined ||
      value.subject !== undefined,
    { message: "At least one of body, to, cc, bcc, or subject is required" },
  );

export type AgentMailSettings = z.infer<typeof agentMailSettingsSchema>;

export type UpdateAgentMailSettingsInput = z.infer<
  typeof updateAgentMailSettingsSchema
>;

export type AgentMailInboxSummary = z.infer<typeof agentMailInboxSchema>;

export type AgentMailTestConnectionResult = z.infer<
  typeof agentMailTestConnectionResultSchema
>;

export type AutoReviewWebhookSettings = z.infer<
  typeof autoReviewWebhookSettingsSchema
>;

export type UpdateAutoReviewWebhookSettingsInput = z.infer<
  typeof updateAutoReviewWebhookSettingsSchema
>;

export type AutoReviewWebhookTestResult = z.infer<
  typeof autoReviewWebhookTestResultSchema
>;

export type AgentMailConceptDraft = z.infer<typeof agentMailConceptDraftSchema>;

export type AgentMailMessage = z.infer<typeof agentMailMessageSchema>;

export type AgentMailMessageDetail = z.infer<
  typeof agentMailMessageDetailSchema
>;

export type AgentMailMessageAttachment = z.infer<
  typeof agentMailMessageAttachmentSchema
>;

export type AgentMailDraftDetail = z.infer<typeof agentMailDraftDetailSchema>;

export type EmailConceptReplyInput = z.infer<
  typeof emailConceptReplyInputSchema
>;

export type EmailConceptReplyResponse = z.infer<
  typeof emailConceptReplyResponseSchema
>;

export type EmailAgentDraftInput = z.infer<typeof emailAgentDraftInputSchema>;

export type EmailAgentDraftStarted = z.infer<typeof emailAgentDraftStartedSchema>;

export type EmailAgentCallbackResult = z.infer<
  typeof emailAgentCallbackResultSchema
>;

export type EmailAgentCallbackPoll = z.infer<typeof emailAgentCallbackPollSchema>;

export type EmailAgentCallbackTaskPayload = z.infer<
  typeof emailAgentCallbackTaskPayloadSchema
>;

export type EmailAgentCallbackEventPayload = z.infer<
  typeof emailAgentCallbackEventPayloadSchema
>;

export type EmailComposeDraftInput = z.infer<
  typeof emailComposeDraftInputSchema
>;

export type EmailStartThreadInput = z.infer<typeof emailStartThreadInputSchema>;

export type EmailStartThreadDryRun = z.infer<
  typeof emailStartThreadDryRunSchema
>;

export type EmailStartThreadResponse = z.infer<
  typeof emailStartThreadResponseSchema
>;

export type EmailComposeDraftResponse = z.infer<
  typeof emailComposeDraftResponseSchema
>;

export type EmailSendDraftResponse = z.infer<
  typeof emailSendDraftResponseSchema
>;

export type EmailDeleteDraftResponse = z.infer<
  typeof emailDeleteDraftResponseSchema
>;

export type EmailDeleteMessageResponse = z.infer<
  typeof emailDeleteMessageResponseSchema
>;

export type EmailReportSpamResponse = z.infer<
  typeof emailReportSpamResponseSchema
>;

export type UpdateAgentMailDraftInput = z.infer<
  typeof updateAgentMailDraftSchema
>;

export type EmailThreadMetadata = z.infer<typeof emailThreadMetadataSchema>;

export type UpdateEmailThreadMetadataInput = z.infer<
  typeof updateEmailThreadMetadataSchema
>;

export type EmailThreadComment = z.infer<typeof emailThreadCommentSchema>;

export type CreateEmailThreadCommentInput = z.infer<
  typeof createEmailThreadCommentSchema
>;

export type UpdateEmailThreadCommentInput = z.infer<
  typeof updateEmailThreadCommentSchema
>;
