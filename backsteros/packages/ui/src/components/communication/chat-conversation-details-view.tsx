"use client";

import { useMemo, useState } from "react";
import type { ChatConversation } from "@backsteros/contracts";

import { chatStatusToTaskStatus } from "../../communication/chat-conversation-list-item.js";
import type { CommunicationChatListRow } from "../../communication/communication-chat-list-row.js";
import {
  DROPDOWN_NONE_VALUE,
  resolveDropdownNone,
} from "../dropdowns/dropdown-options.js";
import { PropertyDropdown } from "../dropdowns/property-dropdown.js";
import type { SearchableDropdownOption } from "../dropdowns/searchable-dropdown.js";
import { PropertyFieldGroup } from "../content/property-field-group.js";
import { ContactPersonIcon } from "../contacts/contact-person-icon.js";
import { EntityOverviewSubgroup } from "../shared/entity-overview-subgroup.js";
import { TaskDueDateDropdown } from "../tasks/task-due-date-dropdown.js";
import { TaskPriorityIcon } from "../tasks/task-priority-icon.js";
import { TaskStatusIcon } from "../tasks/task-status-icon.js";
import {
  getTaskPriorityLabel,
  TASK_PRIORITY_ORDER,
} from "../../tasks/task-priority.js";
import { PreviousConversationsList } from "./previous-conversations-list.js";

export type ChatConversationStatus =
  | "open"
  | "resolved"
  | "pending"
  | "snoozed";

/** Chatwoot values with BacksterOS labels (same groups as the mixed list). */
const STATUS_OPTIONS: {
  value: ChatConversationStatus;
  label: string;
}[] = [
  { value: "open", label: "Triage" },
  { value: "pending", label: "Waiting" },
  { value: "snoozed", label: "On Hold" },
  { value: "resolved", label: "Completed" },
];

export type ChatConversationDetailsViewProps = {
  conversation: ChatConversation;
  /** Prior chats / emails / support for this contact or visitor. */
  previousItems?: readonly CommunicationChatListRow[];
  statusUpdating?: boolean;
  propertiesUpdating?: boolean;
  assigneeOptions?: SearchableDropdownOption<string>[];
  onStatusChange?: (status: ChatConversationStatus) => void | Promise<void>;
  onAssigneeChange?: (assigneeId: string | null) => void | Promise<void>;
  onPriorityChange?: (priority: number) => void | Promise<void>;
  onDueDateChange?: (dueDate: Date | null) => void | Promise<void>;
  onSelectConversation?: (conversationId: string) => void;
  onSelectEmail?: (emailId: string) => void;
  onSelectSupport?: (supportId: string) => void;
  onViewAllPrevious?: () => void;
};

/**
 * Chat rail “Details” tab — contact-style subgroup separators + property rows,
 * plus conversation ids and prior visitor threads.
 */
export function ChatConversationDetailsView({
  conversation,
  previousItems = [],
  statusUpdating = false,
  propertiesUpdating = false,
  assigneeOptions = [],
  onStatusChange,
  onAssigneeChange,
  onPriorityChange,
  onDueDateChange,
  onSelectConversation,
  onSelectEmail,
  onSelectSupport,
  onViewAllPrevious,
}: ChatConversationDetailsViewProps) {
  const [copiedField, setCopiedField] = useState<"id" | "external" | null>(
    null,
  );
  const statusLabel =
    STATUS_OPTIONS.find((entry) => entry.value === conversation.status)
      ?.label ?? conversation.status;
  const taskStatus = chatStatusToTaskStatus(conversation.status);
  const priority = conversation.priority ?? 0;
  const dueDate = conversation.dueDate ? new Date(conversation.dueDate) : null;
  const propertiesDisabled = propertiesUpdating;

  const statusOptions = useMemo(
    () =>
      STATUS_OPTIONS.map((entry) => ({
        value: entry.value,
        label: entry.label,
        icon: (
          <TaskStatusIcon
            status={chatStatusToTaskStatus(entry.value)}
            size={14}
          />
        ),
      })),
    [],
  );

  const priorityOptions = useMemo(
    () =>
      TASK_PRIORITY_ORDER.map((value) => ({
        value: String(value),
        label: getTaskPriorityLabel(value),
        icon: <TaskPriorityIcon priority={value} size={14} />,
      })),
    [],
  );

  async function copyValue(field: "id" | "external", value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      window.setTimeout(() => setCopiedField(null), 1400);
    } catch {
      /* ignore clipboard failures */
    }
  }

  return (
    <div className="communication-chat-details entity-overview__details contact-details">
      <EntityOverviewSubgroup
        title="Properties"
        storageKey="comm-chat-details-properties"
      >
        <PropertyFieldGroup label="Assignee">
          <PropertyDropdown
            value={conversation.assigneeId ?? DROPDOWN_NONE_VALUE}
            options={assigneeOptions}
            onChange={(next) => {
              void onAssigneeChange?.(resolveDropdownNone(next));
            }}
            disabled={propertiesDisabled || !onAssigneeChange}
            searchPlaceholder="Change assignee…"
            ariaLabel="Assignee"
            fallbackIcon={<ContactPersonIcon size={14} />}
            fallbackLabel="Unassigned"
            mutedFallback
            panelAlign="start"
            panelWidth={260}
          />
        </PropertyFieldGroup>
        <PropertyFieldGroup label="Status">
          <PropertyDropdown
            value={conversation.status}
            options={statusOptions}
            onChange={(next) => {
              void onStatusChange?.(next as ChatConversationStatus);
            }}
            disabled={statusUpdating || !onStatusChange}
            searchPlaceholder="Change status…"
            ariaLabel="Conversation status"
            fallbackIcon={
              <TaskStatusIcon status={taskStatus} size={14} />
            }
            fallbackLabel={statusLabel}
            panelAlign="start"
            panelWidth={220}
          />
        </PropertyFieldGroup>
        <PropertyFieldGroup label="Priority">
          <PropertyDropdown
            value={String(priority)}
            options={priorityOptions}
            onChange={(next) => {
              void onPriorityChange?.(Number(next));
            }}
            disabled={propertiesDisabled || !onPriorityChange}
            searchPlaceholder="Change priority…"
            ariaLabel="Priority"
            fallbackIcon={<TaskPriorityIcon priority={priority} size={14} />}
            fallbackLabel={getTaskPriorityLabel(priority)}
            panelAlign="start"
            panelWidth={220}
          />
        </PropertyFieldGroup>
        <PropertyFieldGroup label="Due date">
          <TaskDueDateDropdown
            dueDate={dueDate}
            status={taskStatus}
            variant="property"
            disabled={propertiesDisabled || !onDueDateChange}
            onDueDateChange={onDueDateChange}
          />
        </PropertyFieldGroup>
      </EntityOverviewSubgroup>

      <EntityOverviewSubgroup
        title="Conversation"
        storageKey="comm-chat-details-conversation"
      >
        <dl className="communication-chat-details__meta">
          <div className="communication-chat-details__meta-row">
            <dt>ID</dt>
            <dd>
              <code className="communication-chat-details__code">
                {conversation.id}
              </code>
              <button
                type="button"
                className="communication-chat-details__copy"
                onClick={() => void copyValue("id", conversation.id)}
              >
                {copiedField === "id" ? "Copied" : "Copy"}
              </button>
            </dd>
          </div>
          <div className="communication-chat-details__meta-row">
            <dt>Chatwoot</dt>
            <dd>
              <code className="communication-chat-details__code">
                {conversation.externalId}
              </code>
              <button
                type="button"
                className="communication-chat-details__copy"
                onClick={() =>
                  void copyValue("external", conversation.externalId)
                }
              >
                {copiedField === "external" ? "Copied" : "Copy"}
              </button>
            </dd>
          </div>
          {conversation.inboxName ? (
            <div className="communication-chat-details__meta-row">
              <dt>Inbox</dt>
              <dd>{conversation.inboxName}</dd>
            </div>
          ) : null}
          {conversation.channelType ? (
            <div className="communication-chat-details__meta-row">
              <dt>Channel</dt>
              <dd>{conversation.channelType}</dd>
            </div>
          ) : null}
        </dl>
      </EntityOverviewSubgroup>

      <PreviousConversationsList
        items={previousItems}
        storageKey="comm-chat-details-previous"
        onSelectChat={onSelectConversation}
        onSelectEmail={onSelectEmail}
        onSelectSupport={onSelectSupport}
        onViewAll={onViewAllPrevious}
      />
    </div>
  );
}
