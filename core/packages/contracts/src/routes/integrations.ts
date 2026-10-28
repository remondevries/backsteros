import { initContract, type AppRouter } from "@ts-rest/core";
import { badRequestSchema, errorSchema } from "../schemas.js";
import * as s from "../schemas.js";
import { z } from "zod";

const c = initContract();

/** Integration settings, chat, Mapbox, TransIP status, external calendar and agent PTY. */
export const integrationsRoutes: AppRouter = c.router({
  getSettings: {
    method: "GET",
    path: "/api/v1/settings",
    responses: {
      200: s.settingsResponseSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary: "Get workspace settings",
  },
  updateSettings: {
    method: "PATCH",
    path: "/api/v1/settings",
    body: s.settingsSchema,
    responses: {
      200: s.settingsResponseSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary: "Update workspace settings",
  },
  getVaultStorageSettings: {
    method: "GET",
    path: "/api/v1/settings/storage",
    responses: {
      200: s.vaultStorageSettingsSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary: "Get local Obsidian-style vault path status",
  },
  updateVaultStorageSettings: {
    method: "PATCH",
    path: "/api/v1/settings/storage",
    body: s.updateVaultStorageSettingsSchema,
    responses: {
      200: s.vaultStorageSettingsSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary:
      "Set local vault folder path (creates Journal/Projects/Letters/Spaces)",
  },
  getCursorSettings: {
    method: "GET",
    path: "/api/v1/settings/cursor",
    responses: {
      200: s.cursorSettingsSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary: "Get Cursor integration settings (API key redacted)",
  },
  updateCursorSettings: {
    method: "PATCH",
    path: "/api/v1/settings/cursor",
    body: s.updateCursorSettingsSchema,
    responses: {
      200: s.cursorSettingsSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary: "Update Cursor API key and spellcheck preferences",
  },
  testCursorConnection: {
    method: "GET",
    path: "/api/v1/settings/cursor/test",
    responses: {
      200: s.cursorTestConnectionResultSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary: "Test Cursor API key by listing models",
  },
  getMoneybirdSettings: {
    method: "GET",
    path: "/api/v1/settings/moneybird",
    responses: {
      200: s.moneybirdSettingsSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary: "Get Moneybird integration settings (API token redacted)",
  },
  updateMoneybirdSettings: {
    method: "PATCH",
    path: "/api/v1/settings/moneybird",
    body: s.updateMoneybirdSettingsSchema,
    responses: {
      200: s.moneybirdSettingsSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary: "Update Moneybird API token and administration id",
  },
  listMoneybirdAdministrations: {
    method: "GET",
    path: "/api/v1/settings/moneybird/administrations",
    responses: {
      200: s.moneybirdAdministrationsResponseSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary: "List Moneybird administrations for the stored API token",
  },
  testMoneybirdConnection: {
    method: "GET",
    path: "/api/v1/settings/moneybird/test",
    responses: {
      200: s.moneybirdTestConnectionResultSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary: "Test Moneybird API token and optional administration access",
  },
  getMapboxSettings: {
    method: "GET",
    path: "/api/v1/settings/mapbox",
    responses: {
      200: s.mapboxSettingsSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary: "Get Mapbox integration settings (access token redacted)",
  },
  updateMapboxSettings: {
    method: "PATCH",
    path: "/api/v1/settings/mapbox",
    body: s.updateMapboxSettingsSchema,
    responses: {
      200: s.mapboxSettingsSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary: "Update Mapbox access token",
  },
  testMapboxConnection: {
    method: "GET",
    path: "/api/v1/settings/mapbox/test",
    responses: {
      200: s.mapboxTestConnectionResultSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary: "Test Mapbox access token with a light geocode call",
  },
  getBrandfetchSettings: {
    method: "GET",
    path: "/api/v1/settings/brandfetch",
    responses: {
      200: s.brandfetchSettingsSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary: "Get Brandfetch integration settings (API key redacted)",
  },
  updateBrandfetchSettings: {
    method: "PATCH",
    path: "/api/v1/settings/brandfetch",
    body: s.updateBrandfetchSettingsSchema,
    responses: {
      200: s.brandfetchSettingsSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary: "Update Brandfetch Brand API key",
  },
  testBrandfetchConnection: {
    method: "GET",
    path: "/api/v1/settings/brandfetch/test",
    responses: {
      200: s.brandfetchTestConnectionResultSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary: "Test Brandfetch Brand API key with a light brand lookup",
  },
  getChatwootSettings: {
    method: "GET",
    path: "/api/v1/settings/chatwoot",
    responses: {
      200: s.chatwootSettingsSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary: "Get Chatwoot integration settings (token redacted)",
  },
  updateChatwootSettings: {
    method: "PATCH",
    path: "/api/v1/settings/chatwoot",
    body: s.updateChatwootSettingsSchema,
    responses: {
      200: s.chatwootSettingsSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary: "Update Chatwoot base URL, account id, and access token",
  },
  testChatwootConnection: {
    method: "GET",
    path: "/api/v1/settings/chatwoot/test",
    responses: {
      200: s.chatwootTestConnectionResultSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary: "Test Chatwoot API token by listing inboxes",
  },
  syncChatwootConversations: {
    method: "POST",
    path: "/api/v1/chat/sync",
    body: z.object({}).optional(),
    responses: {
      200: s.chatSyncResultSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary: "Pull recent open Chatwoot conversations into the local mirror",
  },
  listChatConversations: {
    method: "GET",
    path: "/api/v1/chat/conversations",
    query: s.listChatConversationsQuerySchema,
    responses: {
      200: s.chatConversationsListSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary: "List mirrored Chatwoot conversations",
  },
  createChatConversation: {
    method: "POST",
    path: "/api/v1/chat/conversations",
    body: s.createChatConversationInputSchema,
    query: z
      .object({
        validate: z
          .union([z.literal("1"), z.literal("true"), z.literal("0"), z.literal("false")])
          .optional(),
      })
      .optional(),
    responses: {
      200: z.union([
        s.chatConversationDetailSchema,
        s.createChatConversationDryRunSchema,
      ]),
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
      422: badRequestSchema,
    },
    summary:
      "Create or reopen a Chatwoot conversation and send the first message (dryRun/validate previews without Chatwoot)",
  },
  listChatInboxes: {
    method: "GET",
    path: "/api/v1/chat/inboxes",
    query: s.listChatInboxesQuerySchema,
    responses: {
      200: s.chatInboxesListSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary: "List Chatwoot inboxes (optionally filtered by channel kind)",
  },
  getChatMessagingWindow: {
    method: "GET",
    path: "/api/v1/chat/messaging-window",
    query: s.chatMessagingWindowQuerySchema,
    responses: {
      200: s.chatMessagingWindowSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary:
      "Whether Meta messaging window is open for a contact on WhatsApp / Instagram / Messenger",
  },
  listChatWhatsAppTemplates: {
    method: "GET",
    path: "/api/v1/chat/whatsapp-templates",
    query: s.listChatWhatsAppTemplatesQuerySchema,
    responses: {
      200: s.chatWhatsAppTemplatesListSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary: "List approved WhatsApp message templates for a Chatwoot inbox",
  },
  getChatConversation: {
    method: "GET",
    path: "/api/v1/chat/conversations/{conversationId}",
    pathParams: z.object({ conversationId: z.string() }),
    responses: {
      200: s.chatConversationDetailSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary: "Get a chat conversation thread",
  },
  createChatMessage: {
    method: "POST",
    path: "/api/v1/chat/conversations/{conversationId}/messages",
    pathParams: z.object({ conversationId: z.string() }),
    body: s.createChatMessageInputSchema,
    responses: {
      200: s.chatMessageSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary: "Reply in a Chatwoot conversation",
  },
  updateChatConversation: {
    method: "PATCH",
    path: "/api/v1/chat/conversations/{conversationId}",
    pathParams: z.object({ conversationId: z.string() }),
    body: s.updateChatConversationInputSchema,
    responses: {
      200: s.chatConversationSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary: "Update chat conversation status (resolve / reopen)",
  },
  deleteChatConversation: {
    method: "DELETE",
    path: "/api/v1/chat/conversations/{conversationId}",
    pathParams: z.object({ conversationId: z.string() }),
    responses: {
      200: z.object({ ok: z.literal(true) }),
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary: "Soft-delete a chat conversation from the local mirror",
  },
  toggleChatTyping: {
    method: "POST",
    path: "/api/v1/chat/conversations/{conversationId}/typing",
    pathParams: z.object({ conversationId: z.string() }),
    body: s.toggleChatTypingInputSchema,
    responses: {
      200: s.toggleChatTypingResultSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary:
      "Toggle Chatwoot agent typing status (drives the website widget bubble)",
  },
  getGoogleCalendarSettings: {
    method: "GET",
    path: "/api/v1/settings/google-calendar",
    responses: {
      200: s.googleCalendarSettingsSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary: "Get Google Calendar integration settings (tokens redacted)",
  },
  updateGoogleCalendarSettings: {
    method: "PATCH",
    path: "/api/v1/settings/google-calendar",
    body: s.updateGoogleCalendarSettingsSchema,
    responses: {
      200: s.googleCalendarSettingsSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary:
      "Update Google Calendar OAuth client credentials / calendar selection",
  },
  testGoogleCalendarConnection: {
    method: "GET",
    path: "/api/v1/settings/google-calendar/test",
    responses: {
      200: s.googleCalendarTestConnectionResultSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary: "Test Google Calendar OAuth tokens with calendarList.list",
  },
  startGoogleCalendarOAuth: {
    method: "POST",
    path: "/api/v1/settings/google-calendar/oauth/start",
    body: z.object({}).optional(),
    responses: {
      200: s.googleCalendarOAuthStartResultSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary: "Start Google Calendar OAuth (returns authorize URL)",
  },
  listGoogleCalendarCalendars: {
    method: "GET",
    path: "/api/v1/settings/google-calendar/calendars",
    responses: {
      200: s.googleCalendarCalendarsResponseSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary: "List Google calendars available after OAuth",
  },
  syncGoogleCalendar: {
    method: "POST",
    path: "/api/v1/settings/google-calendar/sync",
    body: z.object({}).optional(),
    responses: {
      200: s.googleCalendarSyncResultSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary: "Pull Google Calendar events into external_calendar_events",
  },
  listExternalCalendarEvents: {
    method: "GET",
    path: "/api/v1/external-calendar-events",
    query: s.listExternalCalendarEventsQuerySchema,
    responses: {
      200: s.listExternalCalendarEventsResponseSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary: "List synced external calendar events for the agenda",
  },
  getGithubSettings: {
    method: "GET",
    path: "/api/v1/settings/github",
    responses: {
      200: s.githubSettingsSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary: "Get GitHub integration settings (API token redacted)",
  },
  updateGithubSettings: {
    method: "PATCH",
    path: "/api/v1/settings/github",
    body: s.updateGithubSettingsSchema,
    responses: {
      200: s.githubSettingsSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary: "Update GitHub personal access token",
  },
  testGithubConnection: {
    method: "GET",
    path: "/api/v1/settings/github/test",
    responses: {
      200: s.githubTestConnectionResultSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary: "Test GitHub API token with /user",
  },
  getTransipStatus: {
    method: "GET",
    path: "/api/v1/transip/status",
    responses: {
      200: s.transipStatusSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary: "Whether a TransIP access token is configured on this core",
  },
  getTransipSettings: {
    method: "GET",
    path: "/api/v1/settings/transip",
    responses: {
      200: s.transipSettingsSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary: "Get TransIP integration settings (access token redacted)",
  },
  updateTransipSettings: {
    method: "PATCH",
    path: "/api/v1/settings/transip",
    body: s.updateTransipSettingsSchema,
    responses: {
      200: s.transipSettingsSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary: "Update TransIP access token",
  },
  testTransipConnection: {
    method: "GET",
    path: "/api/v1/settings/transip/test",
    responses: {
      200: s.transipTestConnectionResultSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary: "Test TransIP access token by listing domains",
  },
  syncTransipDomains: {
    method: "POST",
    path: "/api/v1/transip/domains/sync",
    body: z.undefined().optional(),
    responses: {
      200: s.transipDomainSyncResultSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary:
      "Import TransIP domains as Catalog domeinname projects (backlog; skip existing domain names)",
  },
  mapboxGeocode: {
    method: "GET",
    path: "/api/v1/mapbox/geocode",
    query: s.mapboxGeocodeQuerySchema,
    responses: {
      200: z.object({
        result: s.mapboxGeocodeResultSchema.nullable(),
      }),
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary: "Forward-geocode a free-text query via Mapbox (server proxy)",
  },
  mapboxStaticMap: {
    method: "GET",
    path: "/api/v1/mapbox/static-map",
    query: s.mapboxStaticMapQuerySchema,
    responses: {
      200: z.any(),
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary: "Fetch a Mapbox static map PNG for lat/lng (server proxy)",
  },
  getAgentMailSettings: {
    method: "GET",
    path: "/api/v1/settings/agentmail",
    responses: {
      200: s.agentMailSettingsSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary: "Get AgentMail integration settings (API key redacted)",
  },
  updateAgentMailSettings: {
    method: "PATCH",
    path: "/api/v1/settings/agentmail",
    body: s.updateAgentMailSettingsSchema,
    responses: {
      200: s.agentMailSettingsSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary: "Update AgentMail API key and inbox id",
  },
  listAgentMailInboxes: {
    method: "GET",
    path: "/api/v1/settings/agentmail/inboxes",
    responses: {
      200: s.agentMailInboxesResponseSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary: "List AgentMail inboxes for the stored API key",
  },
  testAgentMailConnection: {
    method: "GET",
    path: "/api/v1/settings/agentmail/test",
    responses: {
      200: s.agentMailTestConnectionResultSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary: "Test AgentMail API key and optional inbox access",
  },
  getAutoReviewWebhookSettings: {
    method: "GET",
    path: "/api/v1/settings/auto-review-webhook",
    responses: {
      200: s.autoReviewWebhookSettingsSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary: "Get auto-review webhook settings (secret redacted; OS-92)",
  },
  updateAutoReviewWebhookSettings: {
    method: "PATCH",
    path: "/api/v1/settings/auto-review-webhook",
    body: s.updateAutoReviewWebhookSettingsSchema,
    responses: {
      200: s.autoReviewWebhookSettingsSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary: "Update auto-review webhook URL, secret, and on/off (OS-92)",
  },
  testAutoReviewWebhook: {
    method: "POST",
    path: "/api/v1/settings/auto-review-webhook/test",
    body: z.object({}).optional(),
    responses: {
      200: s.autoReviewWebhookTestResultSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary: "Send a signed test auto-review webhook (OS-92)",
  },
  listCursorModels: {
    method: "GET",
    path: "/api/v1/settings/cursor/models",
    responses: {
      200: s.cursorModelsResponseSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary: "List Cursor models available for the stored API key",
  },
  getAgentPtyConnection: {
    method: "GET",
    path: "/api/v1/agent-pty/connection",
    responses: {
      200: s.agentPtyConnectionSchema,
      401: errorSchema,
      403: errorSchema,
      503: errorSchema,
    },
    summary:
      "Discover Tailscale-reachable PTY sidecar URL + auth token for agent TUI clients",
  },
  listAgentMessageWebhooks: {
    method: "GET",
    path: "/api/v1/agent/message-webhooks",
    responses: {
      200: s.agentMessageWebhooksListSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary:
      "List agent message webhooks (chat/email). No secrets returned. Requires chat:read or email:read.",
  },
  createAgentMessageWebhook: {
    method: "POST",
    path: "/api/v1/agent/message-webhooks",
    body: s.createAgentMessageWebhookInputSchema,
    responses: {
      200: s.agentMessageWebhookCreatedSchema,
      400: badRequestSchema,
      401: errorSchema,
      403: errorSchema,
    },
    summary:
      "Register an HMAC-signed outbound webhook for new chat/email messages. Secret returned once.",
  },
  deleteAgentMessageWebhook: {
    method: "DELETE",
    path: "/api/v1/agent/message-webhooks/:webhookId",
    pathParams: z.object({ webhookId: z.string().min(1) }),
    responses: {
      200: z.object({ ok: z.literal(true) }),
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
    summary: "Revoke an agent message webhook",
  },
});
