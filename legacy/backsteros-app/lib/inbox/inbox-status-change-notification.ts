"use client";

import {
  getContactTaskHrefFromKey,
  getLettersHref,
  getProjectLetterHref,
  getProjectTaskHref,
} from "@/lib/entity-route-hrefs";
import { pushNotification } from "@/lib/notifications";
import { getTaskStatusLabel, type TaskStatus } from "@/lib/task-status";

type InboxStatusChangeRouter = {
  push: (href: string) => void;
  refresh: () => void;
};

type InboxTaskStatusChangeInput = {
  kind: "task";
  title: string;
  status: TaskStatus;
  taskNumber: number;
  projectKey: string | null;
  projectName: string | null;
  contactKey: string | null;
};

type InboxLetterStatusChangeInput = {
  kind: "letter";
  title: string;
  status: TaskStatus;
  letterNumber: number | null;
  projectKey: string | null;
  projectName: string | null;
};

export type InboxStatusChangeInput =
  | InboxTaskStatusChangeInput
  | InboxLetterStatusChangeInput;

function buildInboxStatusDestinationLabel(input: InboxStatusChangeInput): string {
  const statusLabel = getTaskStatusLabel(input.status);

  if (input.projectName?.trim()) {
    return `${statusLabel} in ${input.projectName.trim()}`;
  }

  if (input.kind === "letter") {
    return `${statusLabel} in Letters`;
  }

  return statusLabel;
}

function buildInboxStatusDestinationHref(input: InboxStatusChangeInput): string | null {
  if (input.kind === "task") {
    if (input.projectKey) {
      return getProjectTaskHref(input.projectKey, input.taskNumber);
    }

    if (input.contactKey) {
      return getContactTaskHrefFromKey(input.contactKey, input.taskNumber);
    }

    return null;
  }

  if (input.projectKey && input.letterNumber != null) {
    return getProjectLetterHref(input.projectKey, input.letterNumber);
  }

  return getLettersHref(input.letterNumber);
}

function buildInboxStatusChangeTitle(input: InboxStatusChangeInput): string {
  return input.kind === "task" ? "Task left inbox" : "Letter left inbox";
}

function buildInboxStatusChangeMessage(input: InboxStatusChangeInput): string {
  const destination = buildInboxStatusDestinationLabel(input);
  const itemLabel = input.kind === "task" ? "Task" : "Letter";
  const trimmedTitle = input.title.trim() || itemLabel;
  return `${trimmedTitle} is now ${destination}.`;
}

function buildInboxStatusChangeMessageLinkLabel(input: InboxStatusChangeInput): string {
  return input.kind === "task" ? "Open task" : "Open letter";
}

export function notifyInboxStatusChange(
  input: InboxStatusChangeInput,
  router: InboxStatusChangeRouter,
): void {
  const href = buildInboxStatusDestinationHref(input);
  const entityId =
    input.kind === "task"
      ? `task-${input.taskNumber}`
      : `letter-${input.letterNumber ?? "unknown"}`;

  pushNotification({
    id: `inbox-status-${input.kind}-${entityId}-${input.status}`,
    kind: "success",
    title: buildInboxStatusChangeTitle(input),
    message: buildInboxStatusChangeMessage(input),
    messageLink: href
      ? {
          label: buildInboxStatusChangeMessageLinkLabel(input),
          onClick: () => router.push(href),
        }
      : undefined,
    entityId,
    entityType: input.kind,
    durationMs: 10_000,
  });
}

export function shouldNotifyInboxStatusChange(nextStatus: TaskStatus): boolean {
  return nextStatus !== "triage";
}

export function navigateInboxAfterStatusChange(
  router: InboxStatusChangeRouter,
): void {
  window.setTimeout(() => {
    router.push("/inbox");
    router.refresh();
  }, 120);
}
