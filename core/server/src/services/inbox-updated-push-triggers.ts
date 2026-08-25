import type { InboxUpdatedNotificationPayload, Meeting } from "@backsteros/contracts";

import {
  buildServerInboxUpdatedEmailNotification,
  buildServerInboxUpdatedMeetingNotification,
  buildServerInboxUpdatedTaskNotification,
} from "./inbox-updated-notification-payload.js";
import { notifyWorkspacePush } from "./push-inbox-triage.js";

type TaskRow = {
  id: string;
  title: string;
  number: number;
  projectId: string | null;
};

export function fireInboxUpdatedPush(
  workspaceId: string,
  payload: InboxUpdatedNotificationPayload,
): void {
  void notifyWorkspacePush(workspaceId, payload).catch((error) => {
    console.warn(
      "inbox updated push failed:",
      error instanceof Error ? error.message : error,
    );
  });
}

export async function pushInboxUpdatedForTaskRow(
  workspaceId: string,
  row: TaskRow,
  projectKey?: string | null,
): Promise<void> {
  const payload = buildServerInboxUpdatedTaskNotification({
    id: row.id,
    title: row.title,
    number: row.number,
    projectKey,
  });
  await notifyWorkspacePush(workspaceId, payload);
}

export async function pushInboxUpdatedForMeeting(
  workspaceId: string,
  meeting: Meeting,
): Promise<void> {
  const scheduleLabel = formatMeetingScheduleLabel(meeting.startAt, meeting.endAt);
  const payload = buildServerInboxUpdatedMeetingNotification({
    id: meeting.id,
    title: meeting.title,
    number: meeting.number,
    scheduleLabel,
  });
  await notifyWorkspacePush(workspaceId, payload);
}

export async function pushInboxUpdatedForEmail(input: {
  workspaceId: string;
  inboxId: string;
  messageId: string;
  subject?: string | null;
  from?: string | null;
}): Promise<void> {
  const payload = buildServerInboxUpdatedEmailNotification({
    inboxId: input.inboxId,
    messageId: input.messageId,
    subject: input.subject?.trim() || "Email thread",
    from: input.from,
  });
  await notifyWorkspacePush(input.workspaceId, payload);
}

function formatMeetingScheduleLabel(startAt: string, endAt: string): string {
  const start = new Date(startAt);
  const end = new Date(endAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "";
  }
  const date = start.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const startTime = start.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  const endTime = end.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${date} ${startTime}–${endTime}`;
}
