import {
  taskRowQualifiesForTriageNotification,
  type InboxTriageNotificationPayload,
} from "@backsteros/contracts";
import type { Meeting } from "@backsteros/contracts";

import {
  buildServerInboxTriageEmailNotification,
  buildServerInboxTriageMeetingNotification,
  buildServerInboxTriageTaskNotification,
} from "./inbox-triage-notification-payload.js";
import { notifyInboxTriage } from "./push-inbox-triage.js";

type TaskRow = {
  id: string;
  title: string;
  number: number;
  inbox: boolean | null;
  status: string;
  dueDate: Date | null;
  agentCreatedAt: Date | null;
  agentInboxApprovedAt: Date | null;
  projectId: string | null;
};

export function fireInboxTriagePush(
  workspaceId: string,
  payload: InboxTriageNotificationPayload,
): void {
  void notifyInboxTriage(workspaceId, payload).catch((error) => {
    console.warn(
      "inbox triage push failed:",
      error instanceof Error ? error.message : error,
    );
  });
}

export async function pushInboxTriageForTaskRow(
  workspaceId: string,
  row: TaskRow,
  projectKey?: string | null,
): Promise<void> {
  if (
    !taskRowQualifiesForTriageNotification({
      inbox: row.inbox,
      status: row.status,
      dueDate: row.dueDate,
      agentCreatedAt: row.agentCreatedAt,
      agentInboxApprovedAt: row.agentInboxApprovedAt,
    })
  ) {
    return;
  }

  const payload = buildServerInboxTriageTaskNotification({
    id: row.id,
    title: row.title,
    number: row.number,
    projectKey,
  });
  await notifyInboxTriage(workspaceId, payload);
}

export async function pushInboxTriageForMeeting(
  workspaceId: string,
  meeting: Meeting,
): Promise<void> {
  const scheduleLabel = formatMeetingScheduleLabel(meeting.startAt, meeting.endAt);
  const payload = buildServerInboxTriageMeetingNotification({
    id: meeting.id,
    title: meeting.title,
    number: meeting.number,
    scheduleLabel,
  });
  await notifyInboxTriage(workspaceId, payload);
}

export async function pushInboxTriageForEmail(input: {
  workspaceId: string;
  inboxId: string;
  messageId: string;
  subject?: string | null;
  from?: string | null;
}): Promise<void> {
  const payload = buildServerInboxTriageEmailNotification({
    inboxId: input.inboxId,
    messageId: input.messageId,
    subject: input.subject?.trim() || "New email",
    from: input.from,
  });
  await notifyInboxTriage(input.workspaceId, payload);
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
