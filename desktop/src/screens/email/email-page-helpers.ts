import type { AgentMailMessageDetail } from "@backsteros/contracts";
import {
  formatTaskDisplayId,
  INBOX_TASK_KEY,
  isTaskPriority,
  isTaskStatus,
  migrateLegacyTaskStatus,
  type EmailThreadBodyViewMode,
  type TaskPriority,
  type TaskStatus,
} from "@backsteros/ui";

import type { EmailAgentTaskCardPayload } from "../../lib/agent/email-agent-prompt";

export function resolveEmailThreadKey(message: AgentMailMessageDetail): string {
  return message.threadId?.trim() || message.messageId.trim();
}

export function requestMailboxReload() {
  window.dispatchEvent(new CustomEvent("backsteros-email-mailboxes-reload"));
}

export const EMAIL_THREAD_BODY_VIEW_MODE_KEY = "backsteros:email-thread-body-view-mode";

export function readEmailThreadBodyViewMode(): EmailThreadBodyViewMode {
  try {
    const raw = window.localStorage.getItem(EMAIL_THREAD_BODY_VIEW_MODE_KEY);
    return raw === "rendered" || raw === "source" ? raw : "plain";
  } catch {
    return "plain";
  }
}

function dueDateMs(value: string | null | undefined): number | null {
  if (!value?.trim()) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

export function resolveAgentTaskMentionChip(
  card: EmailAgentTaskCardPayload,
  catalogTasks: readonly {
    id: string;
    displayId: string;
    title: string;
    status: TaskStatus;
    priority: TaskPriority;
    dueDate: number | null;
    projectName: string | null;
    projectIcon: string | null;
  }[],
): {
  href: string;
  task: {
    displayId: string;
    title: string;
    status: TaskStatus;
    priority: TaskPriority;
    dueDate: number | null;
    projectName: string | null;
    projectIcon: string | null;
  };
} {
  const live = catalogTasks.find((entry) => entry.id === card.taskId) ?? null;
  if (live) {
    return { href: card.href, task: live };
  }

  const displayId =
    card.displayId?.trim() ||
    (card.projectKey && card.number != null
      ? formatTaskDisplayId(card.projectKey, card.number)
      : card.number != null
        ? formatTaskDisplayId(INBOX_TASK_KEY, card.number)
        : card.title);
  const statusRaw = card.status?.trim() || "triage";
  const status = isTaskStatus(statusRaw)
    ? statusRaw
    : migrateLegacyTaskStatus(statusRaw);
  const priority =
    card.priority != null && isTaskPriority(card.priority)
      ? card.priority
      : 0;

  return {
    href: card.href,
    task: {
      displayId,
      title: card.title,
      status: isTaskStatus(status) ? status : "triage",
      priority,
      dueDate: dueDateMs(card.dueDate),
      projectName: card.projectName ?? null,
      projectIcon: card.projectIcon ?? null,
    },
  };
}
