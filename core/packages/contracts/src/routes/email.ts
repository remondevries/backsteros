import { initContract, type AppRouter } from "@ts-rest/core";
import { badRequestSchema, errorSchema } from "../schemas.js";
import * as s from "../schemas.js";
import { z } from "zod";

const c = initContract();

/** Email threads, drafts and AgentMail. */
export const emailRoutes: AppRouter = c.router({
  listAgentMailMessages: {
    method: "GET",
    path: "/api/v1/email/messages",
    query: s.listEmailMessagesQuerySchema,
    responses: {
      200: z.union([
        s.agentMailMessagesResponseSchema,
        s.listPaginatedResponseSchema(s.agentMailMessageSchema),
      ]),
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary: "List recent messages from selected AgentMail inboxes",
  },
  getAgentMailMessage: {
    method: "GET",
    path: "/api/v1/email/inboxes/:inboxId/messages/:messageId",
    pathParams: z.object({
      inboxId: z.string().min(1),
      messageId: z.string().min(1),
    }),
    responses: {
      200: s.agentMailMessageDetailSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary: "Get one AgentMail message including body text",
  },
  deleteAgentMailMessage: {
    method: "DELETE",
    path: "/api/v1/email/inboxes/:inboxId/messages/:messageId",
    pathParams: z.object({
      inboxId: z.string().min(1),
      messageId: z.string().min(1),
    }),
    responses: {
      200: s.emailDeleteMessageResponseSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary:
      "Delete an AgentMail message/thread and local BacksterOS email metadata",
  },
  reportAgentMailMessageSpam: {
    method: "POST",
    path: "/api/v1/email/inboxes/:inboxId/messages/:messageId/report-spam",
    pathParams: z.object({
      inboxId: z.string().min(1),
      messageId: z.string().min(1),
    }),
    body: z.object({}).optional(),
    responses: {
      200: s.emailReportSpamResponseSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary:
      "Report AgentMail message as spam (label + block sender) and remove it",
  },
  getAgentMailDraft: {
    method: "GET",
    path: "/api/v1/email/inboxes/:inboxId/drafts/:draftId",
    pathParams: z.object({
      inboxId: z.string().min(1),
      draftId: z.string().min(1),
    }),
    responses: {
      200: s.agentMailDraftDetailSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary: "Get one AgentMail reply draft (concept)",
  },
  createEmailConceptReply: {
    method: "POST",
    path: "/api/v1/email/inboxes/:inboxId/messages/:messageId/concept-reply",
    pathParams: z.object({
      inboxId: z.string().min(1),
      messageId: z.string().min(1),
    }),
    body: s.emailConceptReplyInputSchema,
    responses: {
      200: s.emailConceptReplyResponseSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary:
      "Assemble agent body-only text into a reply draft and upsert in AgentMail",
  },
  startEmailAgentDraft: {
    method: "POST",
    path: "/api/v1/email/inboxes/:inboxId/messages/:messageId/agent-draft",
    pathParams: z.object({
      inboxId: z.string().min(1),
      messageId: z.string().min(1),
    }),
    body: s.emailAgentDraftInputSchema,
    responses: {
      200: s.emailAgentDraftStartedSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary:
      "Classify→execute fixed email commands in core, or wake Judith for prose (trimmed payload)",
  },
  getEmailAgentDraftCallback: {
    method: "GET",
    path: "/api/v1/email/agent-draft-callbacks/:requestId",
    pathParams: z.object({
      requestId: z.string().min(1),
    }),
    responses: {
      200: s.emailAgentCallbackPollSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary: "Poll Grok Bot email agent command callback mailbox",
  },
  listEmailInboxes: {
    method: "GET",
    path: "/api/v1/email/inboxes",
    responses: {
      200: s.agentMailInboxesResponseSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary:
      "List AgentMail inboxes (email:read — no settings scope required)",
  },
  startEmailThread: {
    method: "POST",
    path: "/api/v1/email/start",
    body: s.emailStartThreadInputSchema,
    query: z
      .object({
        validate: z
          .union([
            z.literal("1"),
            z.literal("true"),
            z.literal("0"),
            z.literal("false"),
          ])
          .optional(),
      })
      .optional(),
    responses: {
      200: s.emailStartThreadResponseSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary:
      "Start a new email thread (compose + send). dryRun/validate previews without AgentMail.",
  },
  createEmailComposeDraft: {
    method: "POST",
    path: "/api/v1/email/inboxes/:inboxId/compose-draft",
    pathParams: z.object({
      inboxId: z.string().min(1),
    }),
    body: s.emailComposeDraftInputSchema,
    responses: {
      200: s.emailComposeDraftResponseSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary:
      "Assemble agent body-only text into a new email draft and upsert in AgentMail",
  },
  sendAgentMailDraft: {
    method: "POST",
    path: "/api/v1/email/inboxes/:inboxId/drafts/:draftId/send",
    pathParams: z.object({
      inboxId: z.string().min(1),
      draftId: z.string().min(1),
    }),
    body: z.object({}).optional(),
    responses: {
      200: s.emailSendDraftResponseSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary: "Send an AgentMail draft (e.g. approved concept reply)",
  },
  deleteAgentMailDraft: {
    method: "DELETE",
    path: "/api/v1/email/inboxes/:inboxId/drafts/:draftId",
    pathParams: z.object({
      inboxId: z.string().min(1),
      draftId: z.string().min(1),
    }),
    responses: {
      200: s.emailDeleteDraftResponseSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary: "Delete an AgentMail draft (e.g. discard concept reply)",
  },
  updateEmailThreadMetadata: {
    method: "PATCH",
    path: "/api/v1/email/inboxes/:inboxId/threads/:threadKey/metadata",
    pathParams: z.object({
      inboxId: z.string().min(1),
      threadKey: z.string().min(1),
    }),
    body: s.updateEmailThreadMetadataSchema,
    responses: {
      200: s.emailThreadMetadataSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary: "Update BacksterOS metadata for an email thread",
  },
  updateAgentMailDraft: {
    method: "PATCH",
    path: "/api/v1/email/inboxes/:inboxId/drafts/:draftId",
    pathParams: z.object({
      inboxId: z.string().min(1),
      draftId: z.string().min(1),
    }),
    body: s.updateAgentMailDraftSchema,
    responses: {
      200: s.agentMailDraftDetailSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary: "Update an AgentMail draft body (e.g. edit concept reply)",
  },
});
