/**
 * AgentMail service barrel — implementation lives in `./agentmail-settings/`.
 * Keep importing from `services/agentmail-settings.js`.
 */
export {
  previewAgentMailApiKey,
  normalizeInboxIds,
  getEmailReplyTemplates,
  getEmailReplyTemplatesForInbox,
  getAgentMailCredentials,
  getAgentMailSettings,
  updateAgentMailSettings,
  agentsPublicWebhookUrl,
  listAgentMailWebhookSecrets,
  listAgentMailInboxes,
  testAgentMailConnection,
  inboxLabel,
  formatAgentMailSettingsError,
} from "./agentmail-settings/settings.js";
export {
  agentMailDraftLifecycleDeps,
  ensureDraftEmailThreadRegistered,
  getAgentMailDraft,
  upsertEmailConceptReply,
  upsertEmailComposeDraft,
  deleteAgentMailDraft,
  updateAgentMailDraft,
} from "./agentmail-settings/drafts.js";
export {
  listAgentMailMessages,
  getAgentMailMessage,
  getAgentMailMessageAttachment,
  deleteAgentMailMessage,
  deleteAgentMailThreadMessage,
  reportAgentMailMessageSpam,
  markAgentMailMessageUnread,
  markAgentMailMessageRead,
  syncAgentMailEmailStatusLabel,
  getAgentMailMessageSource,
} from "./agentmail-settings/messages.js";
export type {
  AgentMailMessageSource,
} from "./agentmail-settings/messages.js";
export {
  startEmailAgentDraft,
  sendAgentMailDraft,
} from "./agentmail-settings/send-lifecycle.js";
