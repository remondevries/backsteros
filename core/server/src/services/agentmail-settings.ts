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
  getStoredAgentMailCredentials,
  getAgentMailSettings,
  updateAgentMailSettings,
  agentsPublicWebhookUrl,
  isAgentMailDoorWebhookUrl,
  classifyAgentMailWebhookEnsure,
  shouldAttemptAgentMailWebhookAdopt,
  isAgentMailWebhookNotFoundError,
  pickAdoptableAgentMailWebhook,
  ensureAgentMailWebhook,
  agentMailWebhookEnsureDeps,
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
  getAgentMailThread,
  getAgentMailMessageForRetriage,
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
  startEmailThread,
} from "./agentmail-settings/send-lifecycle.js";
