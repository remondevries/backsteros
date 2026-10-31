/**
 * Source-agnostic chat message format for the unified ChatThread UI.
 *
 * One shape for Messages channels (Telegram/WhatsApp/X/support), Grok Bot
 * agents (webhooks), and Cursor coding agents (T3 Code). Adapters map each
 * source into this format; `@backsteros/ui` ChatThread renders it.
 *
 * Keep this small — add parts only when a real source needs them.
 */
import { z } from "zod";

/** Lifecycle of a single message in the thread. */
export const chatUiMessageStatusSchema = z.enum([
  "pending",
  "streaming",
  "done",
  "error",
]);
export type ChatUiMessageStatus = z.infer<typeof chatUiMessageStatusSchema>;

/** Who produced the message (UI alignment / avatar). */
export const chatUiMessageRoleSchema = z.enum([
  "user",
  "assistant",
  "system",
]);
export type ChatUiMessageRole = z.infer<typeof chatUiMessageRoleSchema>;

export const chatUiAuthorSchema = z.object({
  id: z.string().optional(),
  name: z.string().nullable().optional(),
  avatarUrl: z.string().nullable().optional(),
});
export type ChatUiAuthor = z.infer<typeof chatUiAuthorSchema>;

export const chatUiToolCallStatusSchema = z.enum([
  "pending",
  "running",
  "done",
  "error",
]);
export type ChatUiToolCallStatus = z.infer<typeof chatUiToolCallStatusSchema>;

/** Plain / markdown text body. */
export const chatUiTextPartSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
  /** When true, render as markdown (GFM). Default false = plain. */
  markdown: z.boolean().optional(),
});
export type ChatUiTextPart = z.infer<typeof chatUiTextPartSchema>;

/** Image or generic file attachment. */
export const chatUiFilePartSchema = z.object({
  type: z.literal("file"),
  url: z.string(),
  name: z.string().optional(),
  mimeType: z.string().optional(),
  /** Prefer image rendering when mime starts with image/ or this is set. */
  kind: z.enum(["image", "file"]).optional(),
});
export type ChatUiFilePart = z.infer<typeof chatUiFilePartSchema>;

/** Expandable tool invocation (agent tools, MCP, etc.). */
export const chatUiToolCallPartSchema = z.object({
  type: z.literal("tool-call"),
  id: z.string().optional(),
  name: z.string(),
  input: z.unknown().optional(),
  output: z.unknown().optional(),
  status: chatUiToolCallStatusSchema.optional(),
});
export type ChatUiToolCallPart = z.infer<typeof chatUiToolCallPartSchema>;

/** Code / patch diff block. */
export const chatUiDiffPartSchema = z.object({
  type: z.literal("diff"),
  language: z.string().optional(),
  /** Unified diff or before/after text. */
  content: z.string(),
  filename: z.string().optional(),
});
export type ChatUiDiffPart = z.infer<typeof chatUiDiffPartSchema>;

/** Centered system status line (activity, typing notice, etc.). */
export const chatUiStatusLinePartSchema = z.object({
  type: z.literal("status-line"),
  text: z.string(),
});
export type ChatUiStatusLinePart = z.infer<typeof chatUiStatusLinePartSchema>;

/** Inline error callout. */
export const chatUiErrorPartSchema = z.object({
  type: z.literal("error"),
  message: z.string(),
  code: z.string().optional(),
});
export type ChatUiErrorPart = z.infer<typeof chatUiErrorPartSchema>;

/** Human-in-the-loop approval gate. */
export const chatUiApprovalRequestPartSchema = z.object({
  type: z.literal("approval-request"),
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  /** Opaque payload for the approver UI / backend. */
  data: z.record(z.unknown()).optional(),
});
export type ChatUiApprovalRequestPart = z.infer<
  typeof chatUiApprovalRequestPartSchema
>;

/**
 * Pluggable card — `cardType` selects a renderer from the ChatThread card
 * registry (`task`, `contact`, `document`, `project`, `email`, …).
 */
export const chatUiCardPartSchema = z.object({
  type: z.literal("card"),
  cardType: z.string(),
  id: z.string(),
  data: z.record(z.unknown()).optional(),
});
export type ChatUiCardPart = z.infer<typeof chatUiCardPartSchema>;

export const chatUiMessagePartSchema = z.discriminatedUnion("type", [
  chatUiTextPartSchema,
  chatUiFilePartSchema,
  chatUiToolCallPartSchema,
  chatUiDiffPartSchema,
  chatUiStatusLinePartSchema,
  chatUiErrorPartSchema,
  chatUiApprovalRequestPartSchema,
  chatUiCardPartSchema,
]);
export type ChatUiMessagePart = z.infer<typeof chatUiMessagePartSchema>;

export const chatUiMessageSchema = z.object({
  id: z.string(),
  role: chatUiMessageRoleSchema,
  author: chatUiAuthorSchema.optional(),
  parts: z.array(chatUiMessagePartSchema),
  status: chatUiMessageStatusSchema.default("done"),
  createdAt: z.string().datetime().optional(),
});
export type ChatUiMessage = z.infer<typeof chatUiMessageSchema>;

export const chatUiThreadSchema = z.object({
  id: z.string(),
  messages: z.array(chatUiMessageSchema),
});
export type ChatUiThread = z.infer<typeof chatUiThreadSchema>;

/** Card payload for `cardType: "task"` — matches document mention block chips. */
export const chatUiTaskCardDataSchema = z.object({
  taskId: z.string(),
  displayId: z.string().optional(),
  title: z.string().optional(),
  href: z.string().optional(),
  status: z.string().optional(),
  /** Short body preview shown when the chat task card expands. */
  description: z.string().nullable().optional(),
  /** 0 = none … 4 = low (Task.priority scale). */
  priority: z.number().int().min(0).max(4).optional(),
  /** Epoch ms or ISO datetime. */
  dueDate: z.union([z.number(), z.string().datetime()]).nullable().optional(),
  projectName: z.string().nullable().optional(),
  projectIcon: z.string().nullable().optional(),
  /** Assignee display name (expand row — not on the collapsed chip). */
  assigneeName: z.string().nullable().optional(),
  /** Related contact / org / email display labels. */
  related: z.array(z.string()).optional(),
  /** Workspace label display names. */
  labels: z.array(z.string()).optional(),
});
export type ChatUiTaskCardData = z.infer<typeof chatUiTaskCardDataSchema>;

/** Card payload for `cardType: "contact"`. */
export const chatUiContactCardDataSchema = z.object({
  contactId: z.string(),
  href: z.string().optional(),
  name: z.string().optional(),
  firstName: z.string().nullable().optional(),
  lastName: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  organizationName: z.string().nullable().optional(),
  organizationAvatarSrc: z.string().nullable().optional(),
  avatarSrc: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  postalCode: z.string().nullable().optional(),
  region: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  displayId: z.string().nullable().optional(),
});
export type ChatUiContactCardData = z.infer<typeof chatUiContactCardDataSchema>;

/** Card payload for `cardType: "document"`. */
export const chatUiDocumentCardDataSchema = z.object({
  documentId: z.string(),
  href: z.string().optional(),
  title: z.string().optional(),
  relativePath: z.string().optional(),
  projectKey: z.string().optional(),
  projectName: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
  /** Epoch ms or ISO datetime. */
  updatedAt: z.union([z.number(), z.string().datetime()]).optional(),
});
export type ChatUiDocumentCardData = z.infer<
  typeof chatUiDocumentCardDataSchema
>;

/** Card payload for `cardType: "project"`. */
export const chatUiProjectCardDataSchema = z.object({
  projectId: z.string(),
  href: z.string().optional(),
  key: z.string().optional(),
  name: z.string().optional(),
  summary: z.string().nullable().optional(),
  status: z.string().optional(),
  area: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
  type: z.string().nullable().optional(),
});
export type ChatUiProjectCardData = z.infer<typeof chatUiProjectCardDataSchema>;

/** Card payload for `cardType: "organization"`. */
export const chatUiOrganizationCardDataSchema = z.object({
  organizationId: z.string(),
  href: z.string().optional(),
  key: z.string().optional(),
  name: z.string().optional(),
  email: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  avatarSrc: z.string().nullable().optional(),
  displayId: z.string().nullable().optional(),
});
export type ChatUiOrganizationCardData = z.infer<
  typeof chatUiOrganizationCardDataSchema
>;

/** Card payload for `cardType: "email"`. */
export const chatUiEmailCardDataSchema = z.object({
  emailId: z.string(),
  href: z.string().optional(),
  displayId: z.string().optional(),
  title: z.string().optional(),
  status: z.string().optional(),
  priority: z.number().int().min(0).max(4).optional(),
  dueDate: z.union([z.number(), z.string().datetime()]).nullable().optional(),
  /** Receive / latest activity timestamp (epoch ms or ISO). */
  receivedAt: z
    .union([z.number(), z.string().datetime()])
    .nullable()
    .optional(),
  /** Raw From header when no linked contact. */
  from: z.string().nullable().optional(),
  projectName: z.string().nullable().optional(),
  contactName: z.string().nullable().optional(),
  snippet: z.string().nullable().optional(),
});
export type ChatUiEmailCardData = z.infer<typeof chatUiEmailCardDataSchema>;

/** Card payload for `cardType: "letter"`. */
export const chatUiLetterCardDataSchema = z.object({
  letterId: z.string(),
  href: z.string().optional(),
  displayId: z.string().optional(),
  title: z.string().optional(),
  status: z.string().optional(),
  dueDate: z.union([z.number(), z.string().datetime()]).nullable().optional(),
  projectName: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
});
export type ChatUiLetterCardData = z.infer<typeof chatUiLetterCardDataSchema>;

/** Card payload for `cardType: "meeting"`. */
export const chatUiMeetingCardDataSchema = z.object({
  meetingId: z.string(),
  href: z.string().optional(),
  displayId: z.string().optional(),
  title: z.string().optional(),
  startAt: z.union([z.number(), z.string().datetime()]).nullable().optional(),
  endAt: z.union([z.number(), z.string().datetime()]).nullable().optional(),
  status: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  projectName: z.string().nullable().optional(),
  projectIcon: z.string().nullable().optional(),
  organizationName: z.string().nullable().optional(),
});
export type ChatUiMeetingCardData = z.infer<typeof chatUiMeetingCardDataSchema>;

/** Card payload for `cardType: "journal"`. */
export const chatUiJournalCardDataSchema = z.object({
  journalId: z.string().optional(),
  href: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  title: z.string().optional(),
  snippet: z.string().nullable().optional(),
  updatedAt: z.union([z.number(), z.string().datetime()]).nullable().optional(),
});
export type ChatUiJournalCardData = z.infer<typeof chatUiJournalCardDataSchema>;

/** Card payload for `cardType: "habit"`. */
export const chatUiHabitCardDataSchema = z.object({
  habitId: z.string(),
  href: z.string().optional(),
  title: z.string().optional(),
  icon: z.string().nullable().optional(),
  cadence: z.string().nullable().optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  completed: z.boolean().nullable().optional(),
});
export type ChatUiHabitCardData = z.infer<typeof chatUiHabitCardDataSchema>;

/** Card payload for `cardType: "message"` (chat conversation). */
export const chatUiMessageCardDataSchema = z.object({
  conversationId: z.string(),
  href: z.string().optional(),
  channelType: z.string().optional(),
  title: z.string().optional(),
  contactName: z.string().nullable().optional(),
  preview: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  lastActivityAt: z
    .union([z.number(), z.string().datetime()])
    .nullable()
    .optional(),
});
export type ChatUiMessageCardData = z.infer<typeof chatUiMessageCardDataSchema>;

/** Card payload for `cardType: "post"` (social network). */
export const chatUiPostCardDataSchema = z.object({
  postId: z.string(),
  href: z.string().optional(),
  platform: z.string().nullable().optional(),
  title: z.string().optional(),
  body: z.string().nullable().optional(),
  authorHandle: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  postedAt: z.union([z.number(), z.string().datetime()]).nullable().optional(),
  scheduledAt: z
    .union([z.number(), z.string().datetime()])
    .nullable()
    .optional(),
});
export type ChatUiPostCardData = z.infer<typeof chatUiPostCardDataSchema>;

/** Card payload for `cardType: "transaction"`. */
export const chatUiTransactionCardDataSchema = z.object({
  transactionId: z.string(),
  href: z.string().optional(),
  title: z.string().optional(),
  amountCents: z.number().int().nullable().optional(),
  currency: z.string().nullable().optional(),
  bookedOn: z.string().nullable().optional(),
  accountName: z.string().nullable().optional(),
  categoryName: z.string().nullable().optional(),
  counterparty: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});
export type ChatUiTransactionCardData = z.infer<
  typeof chatUiTransactionCardDataSchema
>;

/** Card payload for `cardType: "invoice"` (Moneybird sales invoice). */
export const chatUiInvoiceCardDataSchema = z.object({
  invoiceId: z.string(),
  href: z.string().optional(),
  title: z.string().optional(),
  invoiceNumber: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  invoiceDate: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  amountLabel: z.string().nullable().optional(),
  contactName: z.string().nullable().optional(),
  currency: z.string().nullable().optional(),
});
export type ChatUiInvoiceCardData = z.infer<typeof chatUiInvoiceCardDataSchema>;

/** Card payload for `cardType: "estimate"` (Lemo-Design proposal). */
export const chatUiEstimateCardDataSchema = z.object({
  estimateId: z.string(),
  href: z.string().optional(),
  title: z.string().optional(),
  displayId: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  documentDate: z.string().nullable().optional(),
  clientLabel: z.string().nullable().optional(),
  totalAmountCents: z.number().int().nullable().optional(),
  currency: z.string().nullable().optional(),
});
export type ChatUiEstimateCardData = z.infer<typeof chatUiEstimateCardDataSchema>;

/** Card payload for `cardType: "choices"` (agent interactive buttons). */
export const chatUiChoicesCardDataSchema = z.object({
  messageId: z.string(),
  prompt: z.string().optional(),
  multiSelect: z.boolean().default(false),
  options: z
    .array(
      z.object({
        label: z.string().min(1).max(60),
        value: z.string().min(1).max(500),
        style: z.enum(["default", "primary", "danger"]).optional(),
      }),
    )
    .min(2)
    .max(6),
  answer: z
    .object({
      values: z.array(z.string().min(1).max(500)).min(1).max(6),
      answeredAt: z.string().datetime(),
    })
    .nullable()
    .optional(),
  /**
   * True when a later user message exists and this was never answered —
   * greyed out, no buttons.
   */
  dismissed: z.boolean().optional(),
});
export type ChatUiChoicesCardData = z.infer<typeof chatUiChoicesCardDataSchema>;

/** Card payload for `cardType: "approval"` (agent approve/reject gate). */
export const chatUiApprovalCardDataSchema = z.object({
  messageId: z.string(),
  title: z.string().min(1).max(120),
  kind: z.enum([
    "deploy",
    "invoice",
    "email",
    "payment",
    "delete",
    "generic",
  ]),
  summary: z.string().min(1).max(500),
  fields: z
    .array(
      z.object({
        label: z.string().min(1).max(40),
        value: z.string().min(1).max(200),
      }),
    )
    .max(12)
    .optional(),
  details: z.string().min(1).max(8192).optional(),
  approveLabel: z.string().min(1).max(40).optional(),
  rejectLabel: z.string().min(1).max(40).optional(),
  destructive: z.boolean().default(false),
  answer: z
    .object({
      decision: z.enum(["approved", "rejected"]),
      note: z.string().min(1).max(500).optional(),
      answeredAt: z.string().datetime(),
    })
    .nullable()
    .optional(),
  /**
   * True when a later user message exists and this was never answered —
   * greyed out, no buttons.
   */
  dismissed: z.boolean().optional(),
});
export type ChatUiApprovalCardData = z.infer<typeof chatUiApprovalCardDataSchema>;

/** Card payload for `cardType: "form"` (agent small form). */
export const chatUiFormCardDataSchema = z.object({
  messageId: z.string(),
  title: z.string().min(1).max(120),
  description: z.string().min(1).max(500).optional(),
  submitLabel: z.string().min(1).max(40).optional(),
  fields: z
    .array(
      z.object({
        name: z.string().min(1).max(40),
        label: z.string().min(1).max(40),
        type: z.enum([
          "text",
          "textarea",
          "number",
          "date",
          "select",
          "checkbox",
        ]),
        required: z.boolean().default(false),
        placeholder: z.string().min(1).max(80).optional(),
        defaultValue: z.union([z.string(), z.number(), z.boolean()]).optional(),
        options: z
          .array(
            z.object({
              label: z.string().min(1).max(60),
              value: z.string().min(1).max(200),
            }),
          )
          .min(2)
          .max(12)
          .optional(),
        min: z.union([z.number(), z.string()]).optional(),
        max: z.union([z.number(), z.string()]).optional(),
      }),
    )
    .min(1)
    .max(8),
  answer: z
    .object({
      values: z.record(
        z.string(),
        z.union([z.string(), z.number(), z.boolean()]),
      ),
      answeredAt: z.string().datetime(),
    })
    .nullable()
    .optional(),
  /**
   * True when a later user message exists and this was never answered —
   * greyed out, no submit.
   */
  dismissed: z.boolean().optional(),
});
export type ChatUiFormCardData = z.infer<typeof chatUiFormCardDataSchema>;

/** Card payload for `cardType: "email-draft"` (agent email draft for Remon to send). */
export const chatUiEmailDraftCardDataSchema = z.object({
  messageId: z.string(),
  to: z
    .array(
      z.object({
        email: z.string().email(),
        name: z.string().nullable().optional(),
        contactId: z.string().nullable().optional(),
      }),
    )
    .min(1)
    .max(10),
  cc: z
    .array(
      z.object({
        email: z.string().email(),
        name: z.string().nullable().optional(),
        contactId: z.string().nullable().optional(),
      }),
    )
    .max(10)
    .optional(),
  bcc: z
    .array(
      z.object({
        email: z.string().email(),
        name: z.string().nullable().optional(),
        contactId: z.string().nullable().optional(),
      }),
    )
    .max(10)
    .optional(),
  subject: z.string().min(1).max(200),
  /** Body-only (no greeting/sign-off). */
  body: z.string().min(1).max(20_480),
  /** Native Messages / AgentMail draft id. */
  draftId: z.string().optional(),
  from: z
    .object({
      inboxId: z.string(),
      email: z.string().email(),
      displayName: z.string().nullable().optional(),
    })
    .optional(),
  /** Server-composed letter shell for preview (greeting + sign-off + full text). */
  preview: z
    .object({
      greeting: z.string(),
      signOff: z.string(),
      text: z.string(),
    })
    .optional(),
  replyToConversationId: z.string().optional(),
  attachments: z
    .array(
      z.object({
        id: z.string(),
        filename: z.string(),
        mime: z.string(),
        size: z.number().int().nonnegative(),
      }),
    )
    .max(20)
    .optional(),
  note: z.string().max(500).optional(),
  result: z
    .object({
      action: z.enum(["sent", "discarded"]),
      sentAt: z.string().datetime(),
      conversationId: z.string().nullable().optional(),
      messageId: z.string().nullable().optional(),
      finalTo: z
        .array(
          z.object({
            email: z.string().email(),
            name: z.string().nullable().optional(),
            contactId: z.string().nullable().optional(),
          }),
        )
        .optional(),
      finalSubject: z.string().optional(),
      finalBody: z.string().optional(),
    })
    .nullable()
    .optional(),
  /**
   * True when a later user message exists and this was never answered —
   * greyed out, no Send/Discard.
   */
  dismissed: z.boolean().optional(),
});
export type ChatUiEmailDraftCardData = z.infer<
  typeof chatUiEmailDraftCardDataSchema
>;

/** Card payload for `cardType: "progress"` (agent live status / progress). */
export const chatUiProgressCardDataSchema = z.object({
  messageId: z.string(),
  title: z.string().min(1).max(120),
  state: z.enum(["running", "succeeded", "failed", "canceled"]),
  steps: z
    .array(
      z.object({
        label: z.string().min(1).max(80),
        state: z.enum(["pending", "running", "done", "failed"]),
      }),
    )
    .max(20)
    .optional(),
  current: z.number().int().nonnegative().optional(),
  total: z.number().int().positive().optional(),
  detail: z.string().min(1).max(200).optional(),
  /** Message createdAt — elapsed timer origin. */
  createdAt: z.string().datetime(),
  /** Last progress / body update. */
  updatedAt: z.string().datetime(),
});
export type ChatUiProgressCardData = z.infer<typeof chatUiProgressCardDataSchema>;

/** Card payload for `cardType: "attachments"` (files below the bubble). */
export const chatUiAttachmentsCardDataSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string(),
        filename: z.string(),
        mime: z.string(),
        size: z.number().int().nonnegative(),
        url: z.string(),
        thumbnailUrl: z.string().nullable().optional(),
        kind: z.enum(["image", "pdf", "file"]),
      }),
    )
    .min(1)
    .max(20),
});
export type ChatUiAttachmentsCardData = z.infer<
  typeof chatUiAttachmentsCardDataSchema
>;

/** Card payload for `cardType: "link-previews"` (URL cards below the bubble). */
export const chatUiLinkPreviewsCardDataSchema = z.object({
  items: z
    .array(
      z.object({
        url: z.string().url(),
        siteName: z.string().nullable().optional(),
        faviconUrl: z.string().nullable().optional(),
        title: z.string().nullable().optional(),
        description: z.string().nullable().optional(),
        imageUrl: z.string().nullable().optional(),
      }),
    )
    .min(1)
    .max(5),
});
export type ChatUiLinkPreviewsCardData = z.infer<
  typeof chatUiLinkPreviewsCardDataSchema
>;
