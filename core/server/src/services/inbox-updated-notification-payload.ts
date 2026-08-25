import {
  buildInboxUpdatedEmailNotification,
  buildInboxUpdatedMeetingNotification,
  buildInboxUpdatedTaskNotification,
  type InboxUpdatedNotificationPayload,
} from "@backsteros/contracts";

import { formatMeetingDisplayId } from "./meetings.js";

export function buildServerInboxUpdatedTaskNotification(input: {
  id: string;
  title: string;
  number: number;
  projectKey?: string | null;
}): InboxUpdatedNotificationPayload {
  const displayId =
    input.number > 0
      ? formatTaskDisplayIdForServer(input.projectKey, input.number)
      : null;
  const href =
    input.number > 0
      ? `/inbox/${formatTaskSlugForServer(input.projectKey, input.number)}`
      : `/inbox/${input.id}`;
  return buildInboxUpdatedTaskNotification({
    id: input.id,
    title: input.title,
    displayId,
    href,
  });
}

export function buildServerInboxUpdatedEmailNotification(input: {
  inboxId: string;
  messageId: string;
  subject: string;
  from?: string | null;
}): InboxUpdatedNotificationPayload {
  return buildInboxUpdatedEmailNotification({
    inboxId: input.inboxId,
    messageId: input.messageId,
    subject: input.subject,
    partyLabel: input.from ?? null,
    href: `/email/${encodeURIComponent(input.inboxId)}/${encodeURIComponent(input.messageId)}`,
  });
}

export function buildServerInboxUpdatedMeetingNotification(input: {
  id: string;
  title: string;
  number: number;
  scheduleLabel?: string | null;
}): InboxUpdatedNotificationPayload {
  return buildInboxUpdatedMeetingNotification({
    id: input.id,
    title: input.title,
    displayId: formatMeetingDisplayId(input.number),
    scheduleLabel: input.scheduleLabel ?? null,
    href: `/inbox/${formatMeetingDisplayId(input.number).toLowerCase()}`,
  });
}

function formatTaskDisplayIdForServer(
  projectKey: string | null | undefined,
  number: number,
): string {
  const key = projectKey?.trim() || "INBOX";
  return `${key}-${number}`;
}

function formatTaskSlugForServer(
  projectKey: string | null | undefined,
  number: number,
): string {
  const key = (projectKey?.trim() || "INBOX").toLowerCase();
  return `${key}-${number}`;
}
