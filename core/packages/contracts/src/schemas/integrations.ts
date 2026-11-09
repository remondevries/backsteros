import { z } from "zod";

import { isoDateSchema } from "./common.js";
export const upsertDevicePushTokenSchema = z.object({
  platform: z.enum(["ios", "android", "web"]),
  token: z.string().min(1),
  deviceName: z.string().max(255).optional(),
});

export const deleteDevicePushTokenSchema = z.object({
  token: z.string().min(1),
});

export const settingsSchema = z.record(z.unknown());

export const settingsResponseSchema = z.object({ settings: settingsSchema });

export const cursorSettingsSchema = z.object({
  apiKeyConfigured: z.boolean(),
  apiKeyPreview: z.string().nullable(),
  spellcheckEnabled: z.boolean(),
  spellcheckModel: z.string(),
  /** Editable agent preamble; empty/null means use the built-in default. */
  spellcheckInstructions: z.string(),
  researchEnabled: z.boolean(),
  researchModel: z.string(),
  /** Editable research preamble; empty/null means use the built-in default. */
  researchInstructions: z.string(),
});

/** Tailscale-reachable PTY sidecar connection for trusted shells (iPad). */
export const agentPtyConnectionSchema = z.object({
  httpOrigin: z.string().url(),
  wsUrl: z.string().url(),
  token: z.string().min(1),
});

export const updateCursorSettingsSchema = z.object({
  /** Set to a new key, or empty string to clear. Omit to leave unchanged. */
  apiKey: z.string().optional(),
  spellcheckEnabled: z.boolean().optional(),
  spellcheckModel: z.string().min(1).max(128).optional(),
  /** Full instruction text. Empty string resets to the built-in default. */
  spellcheckInstructions: z.string().max(20_000).optional(),
  researchEnabled: z.boolean().optional(),
  researchModel: z.string().min(1).max(128).optional(),
  /** Full instruction text. Empty string resets to the built-in default. */
  researchInstructions: z.string().max(20_000).optional(),
});

export const cursorTestConnectionResultSchema = z.object({
  ok: z.boolean(),
  error: z.string().nullable(),
  modelCount: z.number().int().nonnegative().nullable(),
});

/**
 * Cursor plan usage for the desktop sidebar credits bar.
 * Populated server-side from the Settings API key (never returns the secret).
 */
export const cursorUsageSchema = z.object({
  available: z.boolean(),
  autoPercentUsed: z.number(),
  apiPercentUsed: z.number(),
  totalPercentUsed: z.number(),
  includedSpendCents: z.number().int().nullable().optional(),
  limitCents: z.number().int().nullable().optional(),
  remainingCents: z.number().int().nullable().optional(),
  displayMessage: z.string().nullable().optional(),
  billingCycleEndMs: z.number().int().nullable().optional(),
  grokBotPercentUsed: z.number().nullable().optional(),
  grokBotResetMs: z.number().int().nullable().optional(),
  /** Human error; should name the credential source that failed. */
  error: z.string().nullable().optional(),
  /** Which credential path produced this sample (e.g. settings_api_key). */
  source: z.string().nullable().optional(),
  sampledAt: z.number().int().nonnegative(),
});

/** Moneybird integration (personal API token + administration). */
export const moneybirdSettingsSchema = z.object({
  apiTokenConfigured: z.boolean(),
  apiTokenPreview: z.string().nullable(),
  administrationId: z.string().nullable(),
  administrationName: z.string().nullable(),
  connected: z.boolean(),
});

export const updateMoneybirdSettingsSchema = z.object({
  /** Set to a new token, or empty string to clear. Omit to leave unchanged. */
  apiToken: z.string().optional(),
  /** Set to an administration id, or null/empty to clear. Omit to leave unchanged. */
  administrationId: z.string().nullable().optional(),
});

export const moneybirdAdministrationSchema = z.object({
  id: z.string(),
  name: z.string(),
  language: z.string().nullable(),
  currency: z.string().nullable(),
});

export const moneybirdAdministrationsResponseSchema = z.object({
  administrations: z.array(moneybirdAdministrationSchema),
});

export const moneybirdTestConnectionResultSchema = z.object({
  ok: z.boolean(),
  error: z.string().nullable(),
  administrationName: z.string().nullable(),
  invoiceSampleCount: z.number().int().nullable(),
});

/**
 * bunq bank connection (OS-166).
 * Secrets are never returned. Dual allowlist:
 * - sandbox → sandbox host + sandbox_ keys
 * - production → api.bunq.com + live keys (read-only; explicit)
 */
export const bunqEnvironmentSchema = z.enum(["sandbox", "production"]);

export const bunqSettingsSchema = z.object({
  environment: bunqEnvironmentSchema,
  apiKeyConfigured: z.boolean(),
  apiKeyPreview: z.string().nullable(),
  signingPrivateKeyConfigured: z.boolean(),
  installationConfigured: z.boolean(),
  sessionConfigured: z.boolean(),
  deviceId: z.string().nullable(),
  userId: z.string().nullable(),
  permittedIps: z.array(z.string()),
  lastConnectedAt: z.string().nullable(),
  connected: z.boolean(),
  /** Finance bank account ensured for bunq testing (`bunq-personal`). */
  bankAccountId: z.string().nullable(),
  bankAccountName: z.string().nullable(),
  /**
   * OS-167 — Ralph payment proposals. Default false until
   * BUNQ_PAYMENT_PROPOSALS_ENABLED=true on the core that holds the key.
   */
  paymentProposalsEnabled: z.boolean(),
  /**
   * Local preview only — BUNQ_PAYMENT_SIMULATION=true uses an in-process fake
   * bank adapter (never dials bunq). Always false in production defaults.
   */
  paymentSimulation: z.boolean(),
});

export const updateBunqSettingsSchema = z
  .object({
    /** Explicit environment allowlist. Omit to leave unchanged. */
    environment: bunqEnvironmentSchema.optional(),
    /** API key; empty string clears. Prefix rules depend on environment. */
    apiKey: z.string().optional(),
    /** RSA private key PEM used for request signing; empty clears. */
    signingPrivateKeyPem: z.string().optional(),
    /** Exact egress IPv4 only — wildcards (*) / CIDR / IPv6 rejected. */
    permittedIps: z.array(z.string().min(1)).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.apiKey !== undefined) {
      const trimmed = value.apiKey.trim();
      if (trimmed === "BUNQ_PERSONAL_API_KEY") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["apiKey"],
          message: "BUNQ_PERSONAL_API_KEY must never be used as the API key value",
        });
      } else if (trimmed && value.environment === "sandbox") {
        if (!trimmed.startsWith("sandbox_")) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["apiKey"],
            message:
              "sandbox environment only accepts sandbox_… API keys",
          });
        }
      } else if (trimmed && value.environment === "production") {
        if (trimmed.startsWith("sandbox_")) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["apiKey"],
            message:
              "production environment refuses sandbox_… API keys",
          });
        }
      }
    }
    if (
      value.permittedIps?.some(
        (ip) => ip.includes("*") || ip.includes("/") || ip.includes(":"),
      )
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["permittedIps"],
        message:
          "permitted_ips must be exact IPv4 addresses (no wildcards, CIDR, or IPv6)",
      });
    }
  });

export const bunqTestConnectionResultSchema = z.object({
  ok: z.boolean(),
  error: z.string().nullable(),
  environment: bunqEnvironmentSchema,
  accountCount: z.number().int().nullable(),
});

export const provisionBunqSandboxUserSchema = z.object({
  permittedIps: z.array(z.string().min(1)).min(1),
});

/** Official sandbox Sugar Daddy funding (≤ €500). Sandbox-only UI testing. */
export const bunqSandboxFundSchema = z.object({
  /** EUR amount as decimal string, e.g. "25.00". Defaults to 25.00. Max 500. */
  amountValue: z.string().min(1).optional(),
});

export const bunqSandboxFundResultSchema = z.object({
  requestInquiryId: z.string(),
  monetaryAccountId: z.string(),
  amountValue: z.string(),
  currency: z.literal("EUR"),
});

export const bunqMonetaryAccountSummarySchema = z.object({
  id: z.string(),
  description: z.string().nullable(),
  balanceValue: z.string().nullable(),
  balanceCurrency: z.string().nullable(),
  status: z.string().nullable(),
  iban: z.string().nullable(),
});

export const bunqMonetaryAccountsResponseSchema = z.object({
  accounts: z.array(bunqMonetaryAccountSummarySchema),
});

export const bunqPaymentSummarySchema = z.object({
  id: z.string(),
  created: z.string().nullable(),
  updated: z.string().nullable(),
  amountValue: z.string().nullable(),
  amountCurrency: z.string().nullable(),
  description: z.string().nullable(),
  counterpartyName: z.string().nullable(),
  counterpartyIban: z.string().nullable(),
  type: z.string().nullable(),
  subType: z.string().nullable(),
});

export const bunqPaymentsQuerySchema = z.object({
  count: z.coerce.number().int().min(1).max(200).optional(),
});

export const bunqPaymentsResponseSchema = z.object({
  payments: z.array(bunqPaymentSummarySchema),
});

/**
 * OS-167 — Ralph proposes; Remon must approve in chat before any transfer.
 * Narrow single-transfer fields only (no draft/schedule/bulk).
 */
export const bunqPaymentProposalStatusSchema = z.enum([
  "pending",
  "approved",
  "rejected",
  "executed",
  "failed",
  "expired",
  "needs_reconciliation",
]);

export const bunqPaymentProposalSchema = z.object({
  id: z.string().min(1),
  proposedByAgentId: z.string().min(1),
  recipientName: z.string().min(1).max(100),
  /** Normalized IBAN (no spaces). Never log / comment in tasks. */
  recipientIban: z.string().min(15).max(34),
  amountValue: z.string().min(1).max(32),
  amountCurrency: z.string().length(3),
  memo: z.string().min(1).max(140),
  sourceMonetaryAccountId: z.string().min(1).max(32),
  proposalHash: z.string().length(64),
  status: bunqPaymentProposalStatusSchema,
  expiresAt: z.string().datetime(),
  chatThreadId: z.string().nullable(),
  chatMessageId: z.string().nullable(),
  approvedByUserId: z.string().nullable(),
  approvedAt: z.string().datetime().nullable(),
  consumedAt: z.string().datetime().nullable(),
  approvedAmountValue: z.string().nullable(),
  bunqPaymentId: z.string().nullable(),
  executionError: z.string().nullable(),
  paymentAttemptedAt: z.string().datetime().nullable(),
  /** Client create dedupe key (not the bunq payment idempotency header). */
  clientIdempotencyKey: z.string().min(1).max(128),
  /**
   * OS-169 — set by dedicated Remon ack endpoint; required before retry when
   * status is needs_reconciliation. Null until explicitly acknowledged.
   */
  unknownOutcomeAcknowledgedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const createBunqPaymentProposalInputSchema = z.object({
  recipientName: z.string().trim().min(1).max(100),
  recipientIban: z.string().trim().min(15).max(42),
  amountValue: z.string().trim().min(1).max(32),
  amountCurrency: z.string().trim().min(3).max(3).default("EUR"),
  memo: z.string().trim().min(1).max(140),
  sourceMonetaryAccountId: z.string().trim().min(1).max(32),
  /** Optional chat thread for the Remon approval card. */
  chatThreadId: z.string().trim().min(1).max(64).optional(),
  /**
   * Client idempotency key (nanoid / uuid). Retries with the same key return
   * the existing proposal instead of creating a duplicate.
   */
  idempotencyKey: z.string().trim().min(8).max(128),
  /** Optional TTL override in seconds (max 7 days). Default 24h. */
  ttlSeconds: z.number().int().min(60).max(604_800).optional(),
});

export const createBunqPaymentProposalResultSchema = z.object({
  proposal: bunqPaymentProposalSchema,
  /**
   * Ready-to-post assistant approval card payload (kind=payment). Ralph posts
   * this on the chat thread; Remon answers via the existing /answer route.
   * Confirmation shows the full canonical IBAN; label is Approve & Pay.
   */
  approval: z.object({
    title: z.string(),
    kind: z.literal("payment"),
    summary: z.string(),
    fields: z
      .array(
        z.object({
          label: z.string(),
          value: z.string(),
        }),
      )
      .optional(),
    details: z.string().optional(),
    approveLabel: z.string().optional(),
    rejectLabel: z.string().optional(),
    paymentProposal: z.object({
      proposalId: z.string(),
      /** Server-derived hash — clients must not invent/bypass. */
      proposalHash: z.string().length(64),
      /**
       * OS-169 — when true, Approve / Retry stays disabled until Remon ticks
       * the reconciliation checkbox (dedicated ack endpoint).
       */
      requiresUnknownOutcomeAck: z.boolean().optional(),
      unknownOutcomeAcknowledged: z.boolean().optional(),
      unknownOutcomeAckLabel: z.string().min(1).max(120).optional(),
    }),
  }),
});

export const approveBunqPaymentProposalInputSchema = z.object({
  /**
   * Exact SHA-256 hex of the canonical proposal fields (server-validated;
   * client-supplied values that do not match are refused).
   */
  proposalHash: z.string().trim().length(64),
  /**
   * Optional amount ≤ proposed. Omit to transfer the full proposed amount.
   */
  amountValue: z.string().trim().min(1).max(32).optional(),
  /**
   * Required on finance REST when status is needs_reconciliation — Remon must
   * also have recorded a prior dedicated ack (`unknownOutcomeAcknowledgedAt`).
   * Chat never invents this flag from Approve alone.
   */
  acknowledgeUnknownOutcome: z.boolean().optional(),
});

export const acknowledgeBunqPaymentUnknownOutcomeInputSchema = z.object({
  proposalHash: z.string().trim().length(64),
  /**
   * When true and the row already has a known bunq payment id, mark executed
   * (reconciled) and never resubmit. Otherwise only records the ack so Retry
   * / Approve & Pay may proceed with the same idempotency key.
   */
  confirmPaymentAlreadyExists: z.boolean().optional(),
});

export const rejectBunqPaymentProposalInputSchema = z.object({
  proposalHash: z.string().trim().length(64),
  note: z.string().trim().min(1).max(500).optional(),
});

export const bunqPaymentProposalResponseSchema = z.object({
  proposal: bunqPaymentProposalSchema,
});

export const bunqPaymentProposalsListSchema = z.object({
  proposals: z.array(bunqPaymentProposalSchema),
});

/** Mapbox integration (access token for geocode + static maps). */
export const mapboxSettingsSchema = z.object({
  accessTokenConfigured: z.boolean(),
  accessTokenPreview: z.string().nullable(),
  connected: z.boolean(),
});

export const updateMapboxSettingsSchema = z.object({
  /** Set to a new token, or empty string to clear. Omit to leave unchanged. */
  accessToken: z.string().optional(),
});

export const mapboxTestConnectionResultSchema = z.object({
  ok: z.boolean(),
  error: z.string().nullable(),
});

/** Brandfetch integration (Brand API key for org logo hydrate / CardDAV). */
export const brandfetchSettingsSchema = z.object({
  apiKeyConfigured: z.boolean(),
  apiKeyPreview: z.string().nullable(),
  /** True when a workspace key or env fallback is configured. */
  connected: z.boolean(),
  /** Env `BRANDFETCH_API_KEY` is set (bootstrap until Settings is filled). */
  envKeyConfigured: z.boolean(),
});

export const updateBrandfetchSettingsSchema = z.object({
  /** Set to a new API key, or empty string to clear. Omit to leave unchanged. */
  apiKey: z.string().optional(),
});

export const brandfetchTestConnectionResultSchema = z.object({
  ok: z.boolean(),
  error: z.string().nullable(),
});

/** Chatwoot integration (website chat → Communication Chat). */
export const chatwootSettingsSchema = z.object({
  baseUrl: z.string().nullable(),
  accountId: z.string().nullable(),
  apiTokenConfigured: z.boolean(),
  apiTokenPreview: z.string().nullable(),
  webhookSecretConfigured: z.boolean(),
  connected: z.boolean(),
  /** Suggested public webhook URL to paste into Chatwoot. */
  webhookUrl: z.string().nullable(),
});

export const updateChatwootSettingsSchema = z.object({
  baseUrl: z.string().optional(),
  accountId: z.string().optional(),
  /** User access token; empty string clears. Omit to leave unchanged. */
  apiAccessToken: z.string().optional(),
  /** Webhook HMAC secret; empty string clears. Omit to leave unchanged. */
  webhookSecret: z.string().optional(),
});

export const chatwootTestConnectionResultSchema = z.object({
  ok: z.boolean(),
  error: z.string().nullable(),
  inboxCount: z.number().int().nullable(),
});

export const chatConversationStatusSchema = z.enum([
  "open",
  "resolved",
  "pending",
  "snoozed",
]);

export const chatConversationSchema = z.object({
  id: z.string(),
  externalId: z.string(),
  inboxId: z.string().nullable(),
  inboxName: z.string().nullable(),
  channelType: z.string().nullable(),
  status: chatConversationStatusSchema,
  contactName: z.string().nullable(),
  contactEmail: z.string().nullable(),
  contactPhone: z.string().nullable(),
  /** Channel username (Telegram handle without @). */
  contactUsername: z.string().nullable(),
  contactAvatarUrl: z.string().nullable(),
  /** Durable BacksterOS contact link (Telegram / Messenger). */
  contactId: z.string().nullable(),
  /** Durable BacksterOS organization link. */
  organizationId: z.string().nullable(),
  lastMessagePreview: z.string().nullable(),
  lastActivityAt: z.string().datetime().nullable(),
  unread: z.boolean(),
  /** Local BacksterOS assignee contact id. */
  assigneeId: z.string().nullable(),
  /** 0 = none, 1 = urgent … 4 = low (same scale as Task.priority). */
  priority: z.number().int().min(0).max(4),
  dueDate: z.string().datetime().nullable(),
  updatedAt: z.string().datetime(),
});

export const chatMessageDirectionSchema = z.enum([
  "incoming",
  "outgoing",
  "activity",
]);

export const chatMessageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  externalId: z.string(),
  direction: chatMessageDirectionSchema,
  content: z.string(),
  contentType: z.string().nullable(),
  senderName: z.string().nullable(),
  private: z.boolean(),
  createdAt: z.string().datetime(),
});

export const chatConversationDetailSchema = chatConversationSchema.extend({
  messages: z.array(chatMessageSchema),
});

export const listChatConversationsQuerySchema = z.object({
  status: chatConversationStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  /** Poll for conversations with lastActivityAt >= this instant (ISO-8601). */
  updatedSince: z.coerce.date().optional(),
});

export const createChatMessageInputSchema = z.object({
  content: z.string().min(1).max(10_000),
  private: z.boolean().optional(),
});

/** Channels that can start/reopen a conversation from Communication → +. */
export const chatCreateChannelSchema = z.enum([
  "whatsapp",
  "instagram",
  "messenger",
  "telegram",
  "support",
  "x",
]);

export const chatWhatsAppTemplateParamsSchema = z.object({
  name: z.string().min(1).max(200),
  category: z.string().min(1).max(64),
  language: z.string().min(1).max(32),
  /** Template variable substitutions (Chatwoot `processed_params`). */
  processedParams: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Start or reopen a Chatwoot conversation and send the first outbound message.
 * WhatsApp outside the 24h window requires `template`.
 * Support tickets may include an optional `subject` (email support inbox).
 * Set `dryRun` / `validate` to resolve the target without calling Chatwoot.
 */
export const createChatConversationInputSchema = z.object({
  channel: chatCreateChannelSchema,
  /** BacksterOS contact id. */
  contactId: z.string().min(1),
  /** Chatwoot inbox id — resolved from channel when omitted. */
  inboxId: z.string().min(1).optional(),
  /** Outgoing message body (rendered template text for WhatsApp templates). */
  content: z.string().min(1).max(10_000),
  /** Support ticket subject (email / Channel::Email inbox). */
  subject: z.string().min(1).max(500).optional(),
  template: chatWhatsAppTemplateParamsSchema.optional(),
  /** Resolve contact/inbox/window and return what would be sent — no Chatwoot call. */
  dryRun: z.boolean().optional(),
  /** Alias for dryRun (query `?validate=1` is also accepted on the route). */
  validate: z.boolean().optional(),
});

export const chatMessagingWindowQuerySchema = z.object({
  channel: chatCreateChannelSchema,
  contactId: z.string().min(1),
});

export const chatMessagingWindowSchema = z.object({
  channel: chatCreateChannelSchema,
  contactId: z.string(),
  /** True when free-form (or within-window) outbound is allowed. */
  open: z.boolean(),
  /** Hours Meta grants after the last incoming message (24, or 168 with HUMAN_AGENT). */
  windowHours: z.number().int().positive(),
  lastIncomingAt: z.string().datetime().nullable(),
  closesAt: z.string().datetime().nullable(),
  /** Human-readable block reason when `open` is false. */
  reason: z.string().nullable(),
  /** Existing local mirror conversation for this contact+channel, if any. */
  conversationId: z.string().nullable(),
  /** Channel source id (phone / PSID / IGSID) when known. */
  sourceId: z.string().nullable(),
  /** WhatsApp: template is required to start/continue outside the window. */
  requiresTemplate: z.boolean(),
});

/** Preview returned when createChatConversation is called with dryRun/validate. */
export const createChatConversationDryRunSchema = z.object({
  dryRun: z.literal(true),
  channel: chatCreateChannelSchema,
  contactId: z.string(),
  contactName: z.string().nullable(),
  inboxId: z.string().nullable(),
  sourceId: z.string().nullable(),
  window: chatMessagingWindowSchema,
  requiresTemplate: z.boolean(),
  template: chatWhatsAppTemplateParamsSchema.nullable(),
  content: z.string(),
  subject: z.string().nullable(),
  conversationId: z.string().nullable(),
});

export const chatWhatsAppTemplateSchema = z.object({
  name: z.string(),
  category: z.string().nullable(),
  language: z.string().nullable(),
  status: z.string().nullable(),
  body: z.string().nullable(),
});

export const listChatWhatsAppTemplatesQuerySchema = z.object({
  inboxId: z.string().min(1).optional(),
});

export const chatWhatsAppTemplatesListSchema = z.object({
  inboxId: z.string(),
  templates: z.array(chatWhatsAppTemplateSchema),
});

export const listChatInboxesQuerySchema = z.object({
  channel: chatCreateChannelSchema.optional(),
});

export const chatInboxSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  channelType: z.string().nullable(),
  channel: chatCreateChannelSchema.nullable(),
});

export const chatInboxesListSchema = z.object({
  inboxes: z.array(chatInboxSummarySchema),
});

/** Agent-registered outbound webhooks for chat/email messages (OS-146). */
export const agentMessageWebhookEventSchema = z.enum([
  "chat.message",
  "email.message",
]);

export const createAgentMessageWebhookInputSchema = z.object({
  url: z.string().url().max(2000),
  events: z.array(agentMessageWebhookEventSchema).min(1).max(2).optional(),
});

export const agentMessageWebhookSchema = z.object({
  id: z.string(),
  url: z.string(),
  events: z.array(agentMessageWebhookEventSchema),
  enabled: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const agentMessageWebhookCreatedSchema = agentMessageWebhookSchema.extend({
  /** Plaintext HMAC secret — returned once on create; store it. */
  secret: z.string().min(1),
});

export const agentMessageWebhooksListSchema = z.object({
  webhooks: z.array(agentMessageWebhookSchema),
});

export const updateChatConversationInputSchema = z.object({
  status: chatConversationStatusSchema.optional(),
  contactId: z.string().nullable().optional(),
  organizationId: z.string().nullable().optional(),
  assigneeId: z.string().nullable().optional(),
  priority: z.number().int().min(0).max(4).optional(),
  dueDate: z.string().datetime().nullable().optional(),
});

export const toggleChatTypingInputSchema = z.object({
  typing: z.boolean(),
});

export const toggleChatTypingResultSchema = z.object({
  ok: z.boolean(),
});

export const chatConversationsListSchema = z.object({
  conversations: z.array(chatConversationSchema),
});

export const chatSyncResultSchema = z.object({
  imported: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
});

/** Google Calendar integration (OAuth + read-only event sync — ADR-037). */
export const googleCalendarSettingsSchema = z.object({
  clientIdConfigured: z.boolean(),
  clientSecretConfigured: z.boolean(),
  refreshTokenConfigured: z.boolean(),
  connected: z.boolean(),
  accountEmail: z.string().nullable(),
  selectedCalendarIds: z.array(z.string()),
  lastSyncedAt: z.string().datetime().nullable(),
  /** Redirect URI to register on the Google Cloud OAuth client. */
  oauthRedirectUri: z.string(),
  /** True when an HTTPS webhook base is configured and at least one watch channel is active. */
  pushEnabled: z.boolean(),
  pushWebhookUrl: z.string().nullable(),
  pushChannelCount: z.number().int().nonnegative(),
  pushError: z.string().nullable(),
});

export const updateGoogleCalendarSettingsSchema = z.object({
  /** OAuth client id; empty string clears. Omit to leave unchanged. */
  clientId: z.string().optional(),
  /** OAuth client secret; empty string clears. Omit to leave unchanged. */
  clientSecret: z.string().optional(),
  /** Refresh token (power-user paste); empty string clears. Omit to leave unchanged. */
  refreshToken: z.string().optional(),
  /** Calendar ids to sync; empty = primary only on next sync. */
  selectedCalendarIds: z.array(z.string().min(1).max(200)).max(50).optional(),
});

export const googleCalendarTestConnectionResultSchema = z.object({
  ok: z.boolean(),
  error: z.string().nullable(),
  accountEmail: z.string().nullable(),
  calendarCount: z.number().int().nullable(),
});

export const googleCalendarOAuthStartResultSchema = z.object({
  authorizeUrl: z.string().url(),
  redirectUri: z.string(),
});

export const googleCalendarCalendarSummarySchema = z.object({
  id: z.string(),
  summary: z.string(),
  primary: z.boolean(),
  selected: z.boolean(),
});

export const googleCalendarCalendarsResponseSchema = z.object({
  calendars: z.array(googleCalendarCalendarSummarySchema),
});

export const googleCalendarSyncResultSchema = z.object({
  ok: z.boolean(),
  error: z.string().nullable(),
  upserted: z.number().int(),
  removed: z.number().int(),
  calendarCount: z.number().int(),
  lastSyncedAt: z.string().datetime().nullable(),
});

export const externalCalendarEventSchema = z.object({
  id: z.string(),
  provider: z.string(),
  calendarId: z.string(),
  externalId: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  location: z.string().nullable(),
  status: z.string().nullable(),
  htmlLink: z.string().nullable(),
  startAt: isoDateSchema.nullable(),
  endAt: isoDateSchema.nullable(),
  allDay: z.boolean(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  updatedAt: isoDateSchema,
  /** Backster meeting notes shell linked to this Google (etc.) block, if any. */
  linkedMeetingId: z.string().nullable().optional(),
});

export const listExternalCalendarEventsQuerySchema = z.object({
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  provider: z.string().min(1).max(64).optional(),
});

export const listExternalCalendarEventsResponseSchema = z.object({
  events: z.array(externalCalendarEventSchema),
});

export const deleteExternalCalendarEventResultSchema = z.object({
  id: z.string(),
  provider: z.string(),
  remoteDeleted: z.boolean(),
  deletedMeetingIds: z.array(z.string()),
});

/** GitHub integration (workspace PAT; optional Clerk OAuth still supported). */
export const githubSettingsSchema = z.object({
  apiTokenConfigured: z.boolean(),
  apiTokenPreview: z.string().nullable(),
  /** True when a workspace PAT or env fallback is configured. */
  connected: z.boolean(),
  /** Env `GITHUB_API_TOKEN` is set (shown so Settings can explain fallback). */
  envTokenConfigured: z.boolean(),
});

export const updateGithubSettingsSchema = z.object({
  /** Set to a new token, or empty string to clear. Omit to leave unchanged. */
  apiToken: z.string().optional(),
});

export const githubTestConnectionResultSchema = z.object({
  ok: z.boolean(),
  error: z.string().nullable(),
  login: z.string().nullable(),
});

/** TransIP domain inventory (Catalog Domains sync). */
export const transipStatusSchema = z.object({
  configured: z.boolean(),
});

export const transipSettingsSchema = z.object({
  /** Control-panel login used with the private key. */
  login: z.string().nullable(),
  loginConfigured: z.boolean(),
  privateKeyConfigured: z.boolean(),
  /** Both login and private key are present. */
  keyConfigured: z.boolean(),
  apiTokenConfigured: z.boolean(),
  apiTokenPreview: z.string().nullable(),
  /** ISO timestamp when the cached JWT expires (if known). */
  tokenExpiresAt: z.string().nullable(),
  /** True when workspace key/token or env fallback is configured. */
  connected: z.boolean(),
  /** Env / ~/.config/secrets/transip.env access token fallback. */
  envTokenConfigured: z.boolean(),
  /** Env login + private key fallback. */
  envKeyConfigured: z.boolean(),
});

export const updateTransipSettingsSchema = z.object({
  /** TransIP account login. Empty string clears. Omit to leave unchanged. */
  login: z.string().optional(),
  /** PEM private key from the TransIP API key pair. Empty clears. */
  privateKey: z.string().optional(),
  /**
   * Legacy: paste a control-panel access token.
   * Prefer login + privateKey (auto-refreshed JWTs). Empty string clears.
   */
  apiToken: z.string().optional(),
});

export const transipTestConnectionResultSchema = z.object({
  ok: z.boolean(),
  error: z.string().nullable(),
  domainCount: z.number().int().nonnegative().nullable(),
});

export const transipDomainSyncCreatedSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
});

export const transipDomainSyncEntrySchema = z.object({
  name: z.string(),
  status: z.string().nullable(),
  registrationDate: z.string().nullable().optional(),
  renewalDate: z.string().nullable(),
  action: z.enum(["created", "skipped", "healed"]),
});

export const transipDomainSyncResultSchema = z.object({
  fetched: z.number().int().nonnegative(),
  created: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  healed: z.number().int().nonnegative().default(0),
  createdProjects: z.array(transipDomainSyncCreatedSchema),
  healedProjectIds: z.array(z.string()).default([]),
  domains: z.array(transipDomainSyncEntrySchema),
});

export const transipDomainNameserverSchema = z.object({
  hostname: z.string(),
  ipv4: z.string().nullable(),
  ipv6: z.string().nullable(),
});

export const transipDomainWhoisContactSchema = z.object({
  type: z.string().nullable(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  companyName: z.string().nullable(),
  companyKvk: z.string().nullable(),
  companyType: z.string().nullable(),
  street: z.string().nullable(),
  number: z.string().nullable(),
  postalCode: z.string().nullable(),
  city: z.string().nullable(),
  phoneNumber: z.string().nullable(),
  faxNumber: z.string().nullable(),
  email: z.string().nullable(),
  country: z.string().nullable(),
});

export const transipDomainDetailSchema = z.object({
  name: z.string(),
  status: z.string().nullable(),
  /** Null when active; typically `"cancelled"` when scheduled/cancelled. */
  cancellationStatus: z.string().nullable(),
  cancellationDate: z.string().nullable(),
  registrationDate: z.string().nullable(),
  renewalDate: z.string().nullable(),
  isDnsOnly: z.boolean(),
  tags: z.array(z.string()),
  authCode: z.string().nullable(),
  authCodeError: z.string().nullable(),
  nameservers: z.array(transipDomainNameserverSchema),
  contacts: z.array(transipDomainWhoisContactSchema),
});

export const updateTransipDomainTagsInputSchema = z.object({
  tags: z.array(z.string()),
});

export const updateTransipDomainTagsResultSchema = z.object({
  tags: z.array(z.string()),
  projectId: z.string().nullable(),
});

export const updateTransipDomainContactsInputSchema = z.object({
  contacts: z.array(transipDomainWhoisContactSchema).min(1),
});

export const updateTransipDomainContactsResultSchema = z.object({
  contacts: z.array(transipDomainWhoisContactSchema),
});

/** TransIP control panel allows up to 13 nameservers (TLD may be lower; min 2). */
export const updateTransipDomainNameserversInputSchema = z.object({
  nameservers: z.array(transipDomainNameserverSchema).min(2).max(13),
});

export const updateTransipDomainNameserversResultSchema = z.object({
  nameservers: z.array(transipDomainNameserverSchema),
});

/** Cloudflare DNS (API token; zone matching for Catalog Domains). */
export const cloudflareStatusSchema = z.object({
  configured: z.boolean(),
});

export const cloudflareSettingsSchema = z.object({
  apiTokenConfigured: z.boolean(),
  apiTokenPreview: z.string().nullable(),
  /** True when a workspace token or env fallback is configured. */
  connected: z.boolean(),
  /** Env / ~/.config/secrets/cloudflare.env fallback is set. */
  envTokenConfigured: z.boolean(),
});

export const updateCloudflareSettingsSchema = z.object({
  /** Set to a new token, or empty string to clear. Omit to leave unchanged. */
  apiToken: z.string().optional(),
});

export const cloudflareTestConnectionResultSchema = z.object({
  ok: z.boolean(),
  error: z.string().nullable(),
  zoneCount: z.number().int().nonnegative().nullable(),
});

export const cloudflareZoneMatchEntrySchema = z.object({
  name: z.string(),
  projectId: z.string().nullable(),
  zoneId: z.string().nullable(),
  action: z.enum([
    "matched",
    "updated",
    "unchanged",
    "unmatched_project",
    "unmatched_zone",
  ]),
});

export const cloudflareZoneMatchResultSchema = z.object({
  fetched: z.number().int().nonnegative(),
  matched: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  unchanged: z.number().int().nonnegative(),
  unmatchedProjects: z.number().int().nonnegative(),
  unmatchedZones: z.number().int().nonnegative(),
  domains: z.array(cloudflareZoneMatchEntrySchema),
});

export const cloudflareProjectZoneResultSchema = z.object({
  projectId: z.string(),
  name: z.string(),
  zoneId: z.string().nullable(),
  action: z.enum(["unchanged", "updated", "unmatched"]),
});

export const cloudflareDnsRecordSchema = z.object({
  id: z.string(),
  type: z.string(),
  name: z.string(),
  content: z.string(),
  ttl: z.number().nullable(),
  proxied: z.boolean().nullable(),
  priority: z.number().nullable(),
});

export const cloudflareDnsRecordsResultSchema = z.object({
  zoneId: z.string(),
  records: z.array(cloudflareDnsRecordSchema),
});

export const updateCloudflareDnsRecordSchema = z.object({
  type: z.string().min(1),
  name: z.string().min(1),
  content: z.string().min(1),
  ttl: z.number().int().positive().nullable(),
  proxied: z.boolean().nullable(),
  priority: z.number().int().nonnegative().nullable(),
});

export const cloudflareDnsRecordUpdateResultSchema = z.object({
  zoneId: z.string(),
  record: cloudflareDnsRecordSchema,
});

export const cloudflarePurgeCacheResultSchema = z.object({
  zoneId: z.string(),
  id: z.string().nullable(),
  purged: z.literal(true),
});

/** Shared place/geocode result for contacts (and later meetings). */
export const mapboxGeocodeResultSchema = z.object({
  latitude: z.number().finite(),
  longitude: z.number().finite(),
  formatted: z.string(),
  relevance: z.number().finite().nullable(),
  placeName: z.string().nullable(),
});

export const mapboxGeocodeQuerySchema = z.object({
  q: z.string().min(1).max(500),
  /** Optional ISO 3166-1 alpha-2 to bias Mapbox results. */
  country: z.string().min(2).max(2).optional(),
});

export const mapboxStaticMapQuerySchema = z.object({
  lat: z.coerce.number().finite().min(-90).max(90),
  lng: z.coerce.number().finite().min(-180).max(180),
  z: z.coerce.number().finite().min(0).max(22).optional(),
  width: z.coerce.number().int().min(1).max(1280).optional(),
  height: z.coerce.number().int().min(1).max(1280).optional(),
});

export const vaultStorageSettingsSchema = z.object({
  configured: z.boolean(),
  provider: z.literal("local-vault"),
  vaultPath: z.string().nullable(),
});

export const updateVaultStorageSettingsSchema = z.object({
  vaultPath: z.string().min(1).max(4096),
});

/** Response from ensuring a project's on-disk vault folder + `.cursor` skills. */
export const projectVaultEnsureSchema = z.object({
  projectId: z.string(),
  projectKey: z.string(),
  projectVaultPath: z.string(),
  localWorkingDirectory: z.string().nullable(),
  assignedWorkingDirectory: z.boolean(),
  createdSkill: z.boolean(),
  /** False when the vault path is not configured yet. */
  configured: z.boolean(),
});

export const cursorModelSchema = z.object({
  id: z.string(),
  displayName: z.string().optional(),
});

export const cursorModelsResponseSchema = z.object({
  models: z.array(cursorModelSchema),
});

export const spellcheckRequestSchema = z.object({
  title: z.string(),
  description: z.string().nullable().optional(),
});

export const spellcheckResponseSchema = z.object({
  title: z.string(),
  description: z.string(),
});

/** Same request/response shape as spellcheck — title/description rewrite. */
export const researchRequestSchema = spellcheckRequestSchema;

export const researchResponseSchema = spellcheckResponseSchema;

export const opsSyncDeviceSchema = z.object({
  deviceId: z.string(),
  lastSeenAt: z.string(),
  eventCount: z.number().int(),
});

export const opsSyncHealthSchema = z.object({
  workspaceId: z.string(),
  cursor: z.number().int(),
  eventsLastHour: z.number().int(),
  devices: z.array(opsSyncDeviceSchema),
  failedPushes: z.array(
    z.object({
      id: z.string(),
      at: z.string(),
      message: z.string(),
    }),
  ),
  spacesConfigured: z.boolean(),
});

export const opsLogEntrySchema = z.object({
  id: z.string(),
  at: z.string(),
  level: z.enum(["info", "warn", "error"]),
  message: z.string(),
  detail: z.string().optional(),
});

export const opsLogsSchema = z.object({
  logs: z.array(opsLogEntrySchema),
});

export const fileTaskCallbackSuccessSchema = z.object({
  ok: z.literal(true),
  requestId: z.string().min(1).max(128),
  taskId: z.string().min(1).max(128).optional(),
  taskRef: z.string().min(1).max(64).optional(),
  title: z.string().max(500).optional(),
  projectId: z.string().min(1).max(128).optional(),
  summary: z.string().max(2000).optional(),
});

export const fileTaskCallbackFailureSchema = z.object({
  ok: z.literal(false),
  requestId: z.string().min(1).max(128),
  error: z.string().min(1).max(2000),
});

export const fileTaskCallbackResultSchema = z.discriminatedUnion("ok", [
  fileTaskCallbackSuccessSchema,
  fileTaskCallbackFailureSchema,
]);

export const createFileTaskCallbackSchema = z.object({
  requestId: z.string().min(1).max(128),
});

export const fileTaskCallbackCreatedSchema = z.object({
  requestId: z.string(),
  callbackUrl: z.string().url(),
  expiresAt: z.string(),
});

export const fileTaskCallbackPollSchema = z.object({
  pending: z.boolean(),
  result: fileTaskCallbackResultSchema.optional(),
});

export type CursorSettings = z.infer<typeof cursorSettingsSchema>;

export type AgentPtyConnection = z.infer<typeof agentPtyConnectionSchema>;

export type UpdateCursorSettingsInput = z.infer<typeof updateCursorSettingsSchema>;

export type CursorTestConnectionResult = z.infer<
  typeof cursorTestConnectionResultSchema
>;

export type CursorUsage = z.infer<typeof cursorUsageSchema>;

export type MoneybirdSettings = z.infer<typeof moneybirdSettingsSchema>;

export type UpdateMoneybirdSettingsInput = z.infer<
  typeof updateMoneybirdSettingsSchema
>;

export type MoneybirdAdministrationSummary = z.infer<
  typeof moneybirdAdministrationSchema
>;

export type MoneybirdTestConnectionResult = z.infer<
  typeof moneybirdTestConnectionResultSchema
>;

export type BunqSettings = z.infer<typeof bunqSettingsSchema>;

export type UpdateBunqSettingsInput = z.infer<typeof updateBunqSettingsSchema>;

export type BunqTestConnectionResult = z.infer<
  typeof bunqTestConnectionResultSchema
>;

export type ProvisionBunqSandboxUserInput = z.infer<
  typeof provisionBunqSandboxUserSchema
>;

export type BunqSandboxFundInput = z.infer<typeof bunqSandboxFundSchema>;

export type BunqSandboxFundResult = z.infer<typeof bunqSandboxFundResultSchema>;

export type BunqMonetaryAccountSummary = z.infer<
  typeof bunqMonetaryAccountSummarySchema
>;

export type BunqPaymentSummary = z.infer<typeof bunqPaymentSummarySchema>;

export type BunqPaymentProposalStatus = z.infer<
  typeof bunqPaymentProposalStatusSchema
>;

export type BunqPaymentProposal = z.infer<typeof bunqPaymentProposalSchema>;

export type CreateBunqPaymentProposalInput = z.infer<
  typeof createBunqPaymentProposalInputSchema
>;

export type CreateBunqPaymentProposalResult = z.infer<
  typeof createBunqPaymentProposalResultSchema
>;

export type ApproveBunqPaymentProposalInput = z.infer<
  typeof approveBunqPaymentProposalInputSchema
>;

export type AcknowledgeBunqPaymentUnknownOutcomeInput = z.infer<
  typeof acknowledgeBunqPaymentUnknownOutcomeInputSchema
>;

export type RejectBunqPaymentProposalInput = z.infer<
  typeof rejectBunqPaymentProposalInputSchema
>;

export type MapboxSettings = z.infer<typeof mapboxSettingsSchema>;

export type BrandfetchSettings = z.infer<typeof brandfetchSettingsSchema>;

export type UpdateBrandfetchSettingsInput = z.infer<
  typeof updateBrandfetchSettingsSchema
>;

export type BrandfetchTestConnectionResult = z.infer<
  typeof brandfetchTestConnectionResultSchema
>;

export type ChatwootSettings = z.infer<typeof chatwootSettingsSchema>;

export type UpdateChatwootSettingsInput = z.infer<
  typeof updateChatwootSettingsSchema
>;

export type ChatwootTestConnectionResult = z.infer<
  typeof chatwootTestConnectionResultSchema
>;

export type ChatConversation = z.infer<typeof chatConversationSchema>;

export type ChatMessage = z.infer<typeof chatMessageSchema>;

export type ChatConversationDetail = z.infer<
  typeof chatConversationDetailSchema
>;

export type ListChatConversationsQuery = z.infer<
  typeof listChatConversationsQuerySchema
>;

export type CreateChatMessageInput = z.infer<
  typeof createChatMessageInputSchema
>;

export type ChatCreateChannel = z.infer<typeof chatCreateChannelSchema>;

export type ChatWhatsAppTemplateParams = z.infer<
  typeof chatWhatsAppTemplateParamsSchema
>;

export type CreateChatConversationInput = z.infer<
  typeof createChatConversationInputSchema
>;

export type CreateChatConversationDryRun = z.infer<
  typeof createChatConversationDryRunSchema
>;

export type ChatMessagingWindowQuery = z.infer<
  typeof chatMessagingWindowQuerySchema
>;

export type ChatMessagingWindow = z.infer<typeof chatMessagingWindowSchema>;

export type ChatWhatsAppTemplate = z.infer<typeof chatWhatsAppTemplateSchema>;

export type ListChatWhatsAppTemplatesQuery = z.infer<
  typeof listChatWhatsAppTemplatesQuerySchema
>;

export type ChatWhatsAppTemplatesList = z.infer<
  typeof chatWhatsAppTemplatesListSchema
>;

export type ListChatInboxesQuery = z.infer<typeof listChatInboxesQuerySchema>;

export type ChatInboxSummary = z.infer<typeof chatInboxSummarySchema>;

export type ChatInboxesList = z.infer<typeof chatInboxesListSchema>;

export type AgentMessageWebhookEvent = z.infer<
  typeof agentMessageWebhookEventSchema
>;

export type CreateAgentMessageWebhookInput = z.infer<
  typeof createAgentMessageWebhookInputSchema
>;

export type AgentMessageWebhook = z.infer<typeof agentMessageWebhookSchema>;

export type AgentMessageWebhookCreated = z.infer<
  typeof agentMessageWebhookCreatedSchema
>;

export type AgentMessageWebhooksList = z.infer<
  typeof agentMessageWebhooksListSchema
>;

export type UpdateChatConversationInput = z.infer<
  typeof updateChatConversationInputSchema
>;

export type ToggleChatTypingInput = z.infer<typeof toggleChatTypingInputSchema>;

export type ToggleChatTypingResult = z.infer<
  typeof toggleChatTypingResultSchema
>;

export type ChatConversationsList = z.infer<typeof chatConversationsListSchema>;

export type ChatSyncResult = z.infer<typeof chatSyncResultSchema>;

export type GoogleCalendarSettings = z.infer<
  typeof googleCalendarSettingsSchema
>;

export type UpdateGoogleCalendarSettingsInput = z.infer<
  typeof updateGoogleCalendarSettingsSchema
>;

export type GoogleCalendarTestConnectionResult = z.infer<
  typeof googleCalendarTestConnectionResultSchema
>;

export type GoogleCalendarOAuthStartResult = z.infer<
  typeof googleCalendarOAuthStartResultSchema
>;

export type GoogleCalendarCalendarSummary = z.infer<
  typeof googleCalendarCalendarSummarySchema
>;

export type GoogleCalendarSyncResult = z.infer<
  typeof googleCalendarSyncResultSchema
>;

export type ExternalCalendarEvent = z.infer<typeof externalCalendarEventSchema>;

export type DeleteExternalCalendarEventResult = z.infer<
  typeof deleteExternalCalendarEventResultSchema
>;

export type ListExternalCalendarEventsQuery = z.infer<
  typeof listExternalCalendarEventsQuerySchema
>;

export type UpdateMapboxSettingsInput = z.infer<
  typeof updateMapboxSettingsSchema
>;

export type GithubSettings = z.infer<typeof githubSettingsSchema>;

export type UpdateGithubSettingsInput = z.infer<
  typeof updateGithubSettingsSchema
>;

export type GithubTestConnectionResult = z.infer<
  typeof githubTestConnectionResultSchema
>;

export type TransipStatus = z.infer<typeof transipStatusSchema>;

export type TransipSettings = z.infer<typeof transipSettingsSchema>;

export type UpdateTransipSettingsInput = z.infer<
  typeof updateTransipSettingsSchema
>;

export type TransipTestConnectionResult = z.infer<
  typeof transipTestConnectionResultSchema
>;

export type TransipDomainSyncResult = z.infer<
  typeof transipDomainSyncResultSchema
>;

export type TransipDomainDetail = z.infer<typeof transipDomainDetailSchema>;

export type UpdateTransipDomainTagsInput = z.infer<
  typeof updateTransipDomainTagsInputSchema
>;

export type UpdateTransipDomainTagsResult = z.infer<
  typeof updateTransipDomainTagsResultSchema
>;

export type UpdateTransipDomainContactsInput = z.infer<
  typeof updateTransipDomainContactsInputSchema
>;

export type UpdateTransipDomainContactsResult = z.infer<
  typeof updateTransipDomainContactsResultSchema
>;

export type UpdateTransipDomainNameserversInput = z.infer<
  typeof updateTransipDomainNameserversInputSchema
>;

export type UpdateTransipDomainNameserversResult = z.infer<
  typeof updateTransipDomainNameserversResultSchema
>;

export type TransipDomainWhoisContact = z.infer<
  typeof transipDomainWhoisContactSchema
>;

export type CloudflareStatus = z.infer<typeof cloudflareStatusSchema>;

export type CloudflareSettings = z.infer<typeof cloudflareSettingsSchema>;

export type UpdateCloudflareSettingsInput = z.infer<
  typeof updateCloudflareSettingsSchema
>;

export type CloudflareTestConnectionResult = z.infer<
  typeof cloudflareTestConnectionResultSchema
>;

export type CloudflareZoneMatchResult = z.infer<
  typeof cloudflareZoneMatchResultSchema
>;

export type CloudflareProjectZoneResult = z.infer<
  typeof cloudflareProjectZoneResultSchema
>;

export type CloudflareDnsRecord = z.infer<typeof cloudflareDnsRecordSchema>;

export type CloudflareDnsRecordsResult = z.infer<
  typeof cloudflareDnsRecordsResultSchema
>;

export type UpdateCloudflareDnsRecordInput = z.infer<
  typeof updateCloudflareDnsRecordSchema
>;

export type CloudflareDnsRecordUpdateResult = z.infer<
  typeof cloudflareDnsRecordUpdateResultSchema
>;

export type CloudflarePurgeCacheResult = z.infer<
  typeof cloudflarePurgeCacheResultSchema
>;

export type MapboxTestConnectionResult = z.infer<
  typeof mapboxTestConnectionResultSchema
>;

export type MapboxGeocodeResult = z.infer<typeof mapboxGeocodeResultSchema>;

export type VaultStorageSettings = z.infer<typeof vaultStorageSettingsSchema>;

export type ProjectVaultEnsure = z.infer<typeof projectVaultEnsureSchema>;

export type UpdateVaultStorageSettingsInput = z.infer<
  typeof updateVaultStorageSettingsSchema
>;

export type CursorModel = z.infer<typeof cursorModelSchema>;

export type SpellcheckRequest = z.infer<typeof spellcheckRequestSchema>;

export type SpellcheckResponse = z.infer<typeof spellcheckResponseSchema>;

export type ResearchRequest = z.infer<typeof researchRequestSchema>;

export type ResearchResponse = z.infer<typeof researchResponseSchema>;

export type FileTaskCallbackResult = z.infer<
  typeof fileTaskCallbackResultSchema
>;

export type CreateFileTaskCallbackInput = z.infer<
  typeof createFileTaskCallbackSchema
>;

export type FileTaskCallbackCreated = z.infer<
  typeof fileTaskCallbackCreatedSchema
>;

export type FileTaskCallbackPoll = z.infer<typeof fileTaskCallbackPollSchema>;
