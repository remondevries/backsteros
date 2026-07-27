"use client";

import {
  formatInboxDueDateLabel,
  getInboxItemDisplayId,
  type InboxListItem,
  type InboxTaskListItem,
} from "../inbox-items.js";
import { getTaskPriorityLabel } from "../task-priority.js";
import { getTaskStatusLabel, isTaskStatus } from "../task-status.js";

export type InboxDetailLayoutProps = {
  item: InboxListItem | null;
  /** True while resolving selection / redirecting to first item. */
  resolving?: boolean;
};

function InboxDetailBreadcrumb({ label }: { label: string }) {
  return (
    <div className="inbox-detail-breadcrumb">
      <span>
        Inbox
        {label ? (
          <>
            {" / "}
            <strong>{label}</strong>
          </>
        ) : null}
      </span>
    </div>
  );
}

function TaskDetailBody({ item }: { item: InboxTaskListItem }) {
  const statusLabel = isTaskStatus(item.status)
    ? getTaskStatusLabel(item.status)
    : item.status;
  const priorityLabel =
    item.priority > 0 ? getTaskPriorityLabel(item.priority) : null;

  return (
    <div className="inbox-detail-body">
      <h1 className="inbox-detail-title">{item.title}</h1>
      <div className="inbox-detail-meta">
        <span>{getInboxItemDisplayId(item)}</span>
        <span>{statusLabel}</span>
        {priorityLabel ? <span>{priorityLabel}</span> : null}
        {item.dueDate != null ? (
          <span>{formatInboxDueDateLabel(item.dueDate)}</span>
        ) : null}
        {item.projectName || item.projectKey ? (
          <span>{item.projectName ?? item.projectKey}</span>
        ) : null}
      </div>
      <div className="inbox-detail-description">
        {item.description?.trim()
          ? item.description
          : "Task description will appear here when synced."}
      </div>
    </div>
  );
}

/**
 * Inbox main pane — empty / resolving / selected task detail chrome.
 * Matches web inbox content proportions without full TaskDetailScreen.
 */
export function InboxDetailLayout({
  item,
  resolving = false,
}: InboxDetailLayoutProps) {
  if (resolving) {
    return (
      <div className="inbox-detail-layout">
        <InboxDetailBreadcrumb label="" />
        <div className="inbox-detail-empty">
          <p>Loading inbox…</p>
        </div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="inbox-detail-layout">
        <InboxDetailBreadcrumb label="" />
        <div className="inbox-detail-empty">
          <p>
            Your inbox is empty. Use capture in the side panel to add a triage
            task.
          </p>
        </div>
      </div>
    );
  }

  if (item.kind === "letter") {
    return (
      <div className="inbox-detail-layout">
        <InboxDetailBreadcrumb label={item.title} />
        <div className="inbox-detail-body">
          <h1 className="inbox-detail-title">{item.title}</h1>
          <div className="inbox-detail-meta">
            <span>{getInboxItemDisplayId(item)}</span>
          </div>
          <div className="inbox-detail-description">
            Letter detail will port next.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="inbox-detail-layout">
      <InboxDetailBreadcrumb label={item.title} />
      <TaskDetailBody item={item} />
    </div>
  );
}
