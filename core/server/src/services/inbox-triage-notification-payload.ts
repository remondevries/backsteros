import {
  buildInboxTriageEmailNotification,
  buildInboxTriageMeetingNotification,
  buildInboxTriageTaskNotification,
  type InboxTriageNotificationPayload,
} from "@backsteros/contracts";

import { formatMeetingDisplayId } from "./meetings.js";

export function buildServerInboxTriageTaskNotification(input: {
  id: string;
  title: string;
  number: number;
  projectKey?: string | null;
}): InboxTriageNotificationPayload {
  const displayId =
    input.number > 0
      ? formatTaskDisplayIdForServer(input.projectKey, input.number)
      : null;
  const href =
    input.number > 0
      ? `/inbox/${formatTaskSlugForServer(input.projectKey, input.number)}`
      : `/inbox/${input.id}`;
  return buildInboxTriageTaskNotification({
    id: input.id,
    title: input.title,
    displayId,
    href,
  });
}

export function buildServerInboxTriageEmailNotification(input: {
  inboxId: string;
  messageId: string;
  subject: string;
  from?: string | null;
}): InboxTriageNotificationPayload {
  return buildInboxTriageEmailNotification({
    inboxId: input.inboxId,
    messageId: input.messageId,
    subject: input.subject,
    partyLabel: input.from ?? null,
    href: `/email/${encodeURIComponent(input.inboxId)}/${encodeURIComponent(input.messageId)}`,
  });
}

export function buildServerInboxTriageMeetingNotification(input: {
  id: string;
  title: string;
  number: number;
  scheduleLabel?: string | null;
}): InboxTriageNotificationPayload {
  return buildInboxTriageMeetingNotification({
    id: input.id,
    title: input.title,
    displayId: formatMeetingDisplayId(input.number),
    scheduleLabel: input.scheduleLabel ?? null,
    href: `/calendar/meetings/${encodeURIComponent(input.id)}`,
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
