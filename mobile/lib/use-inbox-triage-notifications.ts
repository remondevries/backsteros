import {
  buildInboxTriageEmailNotification,
  buildInboxTriageMeetingNotification,
  buildInboxTriageTaskNotification,
  type InboxTriageNotificationPayload,
} from "@backsteros/contracts";
import { useEffect, useMemo, useRef } from "react";

import { useAgentMail } from "./agentmail-context";
import { emailBelongsInInbox, isEmailIncomingStatus } from "./email-list";
import { getInboxAttentionGroupKey, taskBelongsInInbox } from "./inbox-attention";
import { showMobileInboxTriageNotification } from "./push-notifications";
import { useLocalQuery } from "./use-local-query";

type InboxTaskRow = {
  id: string;
  title: string | null;
  status: string | null;
  number: number | null;
  project_id: string | null;
  project_key: string | null;
  display_id?: string | null;
  due_date: string | null;
  updated_at: string | null;
  inbox: number | boolean | null;
  agent_created_at: string | null;
  agent_inbox_approved_at: string | null;
  inbox_updated_at: string | null;
  habit_id: string | null;
};

type TriageMeetingRow = {
  id: string;
  title: string | null;
  number: number | null;
  status: string | null;
  start_at: string;
  end_at: string;
};

type TriageTrackable = {
  key: string;
  groupInput: Parameters<typeof getInboxAttentionGroupKey>[0];
  build: () => InboxTriageNotificationPayload;
};

function formatMeetingScheduleLabel(startAt: string, endAt: string): string {
  const start = new Date(startAt);
  const end = new Date(endAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "";
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

function collectMobileInboxTriageArrivals(input: {
  previousKeys: ReadonlySet<string>;
  trackables: readonly TriageTrackable[];
}): InboxTriageNotificationPayload[] {
  if (input.previousKeys.size === 0) return [];
  const out: InboxTriageNotificationPayload[] = [];
  for (const item of input.trackables) {
    if (getInboxAttentionGroupKey(item.groupInput) !== "triage") continue;
    if (input.previousKeys.has(item.key)) continue;
    out.push(item.build());
  }
  return out;
}

function snapshotMobileTriageKeys(
  trackables: readonly TriageTrackable[],
): Set<string> {
  const keys = new Set<string>();
  for (const item of trackables) {
    if (getInboxAttentionGroupKey(item.groupInput) !== "triage") continue;
    keys.add(item.key);
  }
  return keys;
}

/**
 * Foreground inbox triage notifications for tasks, email, and portal meetings.
 */
export function useInboxTriageNotifications(): void {
  const agentMail = useAgentMail();
  const { data: taskRows } = useLocalQuery<InboxTaskRow>(
    `SELECT t.id, t.title, t.status, t.number, t.project_id, p.key AS project_key,
            t.due_date, t.updated_at, t.inbox, t.agent_created_at, t.agent_inbox_approved_at,
            t.inbox_updated_at, t.habit_id
     FROM tasks t
     LEFT JOIN projects p ON p.id = t.project_id
     WHERE t.deleted_at IS NULL`,
  );
  const { data: meetingRows } = useLocalQuery<TriageMeetingRow>(
    `SELECT m.id, m.title, m.number, m.status, m.start_at, m.end_at
     FROM meetings m
     WHERE m.deleted_at IS NULL AND m.status = 'triage'`,
  );

  const trackables = useMemo(() => {
    const items: TriageTrackable[] = [];

    for (const row of taskRows ?? []) {
      if (
        !taskBelongsInInbox({
          inbox: row.inbox,
          status: row.status,
          due_date: row.due_date,
          agent_created_at: row.agent_created_at,
          agent_inbox_approved_at: row.agent_inbox_approved_at,
          inbox_updated_at: row.inbox_updated_at,
          habit_id: row.habit_id,
        })
      ) {
        continue;
      }
      items.push({
        key: row.id,
        groupInput: {
          inbox: row.inbox,
          status: row.status,
          due_date: row.due_date,
          agent_created_at: row.agent_created_at,
          agent_inbox_approved_at: row.agent_inbox_approved_at,
          inbox_updated_at: row.inbox_updated_at,
        },
        build: () =>
          buildInboxTriageTaskNotification({
            id: row.id,
            title: row.title?.trim() || "Untitled",
            displayId: row.project_key
              ? `${row.project_key}-${row.number ?? 0}`
              : null,
            href:
              row.number && row.project_key
                ? `/inbox/${row.project_key.toLowerCase()}-${row.number}`
                : `/inbox/${row.id}`,
          }),
      });
    }

    for (const message of agentMail.messages) {
      if (
        !emailBelongsInInbox({
          status: message.status,
          dueDate: message.dueDate,
        })
      ) {
        continue;
      }
      const stableKey = `${message.inboxId}:${message.id}`;
      items.push({
        key: stableKey,
        groupInput: {
          inbox: isEmailIncomingStatus(message.status) ? true : false,
          status: message.status,
          due_date: message.dueDate,
        },
        build: () =>
          buildInboxTriageEmailNotification({
            inboxId: message.inboxId,
            messageId: message.id,
            subject: message.subject,
            partyLabel: message.from,
            href: `/email/${encodeURIComponent(message.inboxId)}/${encodeURIComponent(message.id)}`,
          }),
      });
    }

    for (const row of meetingRows ?? []) {
      items.push({
        key: row.id,
        groupInput: { status: row.status },
        build: () =>
          buildInboxTriageMeetingNotification({
            id: row.id,
            title: row.title?.trim() || "Meeting",
            displayId: row.number ? `M-${row.number}` : null,
            scheduleLabel: formatMeetingScheduleLabel(row.start_at, row.end_at),
            href: `/calendar/meetings/${encodeURIComponent(row.id)}`,
          }),
      });
    }

    return items;
  }, [agentMail.messages, meetingRows, taskRows]);

  const previousKeysRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    const currentKeys = snapshotMobileTriageKeys(trackables);
    const previousKeys = previousKeysRef.current;
    previousKeysRef.current = currentKeys;
    if (!previousKeys) return;

    const arrivals = collectMobileInboxTriageArrivals({
      previousKeys,
      trackables,
    });
    for (const notification of arrivals) {
      void showMobileInboxTriageNotification(notification);
    }
  }, [trackables]);
}
