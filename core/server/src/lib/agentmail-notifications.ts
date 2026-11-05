/**
 * Portal / staff transactional mail (invite, password reset, meeting notices)
 * is tagged with this AgentMail label so it lives in a Notifications folder
 * and stays out of BacksterOS Communication / email lists.
 *
 * AgentMail has no custom IMAP folders — labels are the folder mechanism.
 */
export const AGENTMAIL_NOTIFICATIONS_LABEL = "notifications";

export function normalizeAgentMailLabel(label: string): string {
  return label.trim().toLowerCase();
}

export function isAgentMailNotificationsLabel(label: string): boolean {
  return normalizeAgentMailLabel(label) === AGENTMAIL_NOTIFICATIONS_LABEL;
}

export function hasAgentMailNotificationsLabel(
  labels: readonly string[] | null | undefined,
): boolean {
  if (!labels?.length) return false;
  return labels.some(isAgentMailNotificationsLabel);
}
