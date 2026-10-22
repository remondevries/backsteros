"use client";

import { useMemo, useState } from "react";
import type { ChatConversation } from "@backsteros/contracts";

import { chatStatusToTaskStatus } from "../../communication/chat-conversation-list-item.js";
import {
  DROPDOWN_NONE_VALUE,
  resolveDropdownNone,
} from "../dropdowns/dropdown-options.js";
import { PropertyDropdown } from "../dropdowns/property-dropdown.js";
import type { SearchableDropdownOption } from "../dropdowns/searchable-dropdown.js";
import { PropertyFieldGroup } from "../content/property-field-group.js";
import { ContactPersonIcon } from "../contacts/contact-person-icon.js";
import { TaskDueDateDropdown } from "../tasks/task-due-date-dropdown.js";
import { TaskPriorityIcon } from "../tasks/task-priority-icon.js";
import {
  getTaskPriorityLabel,
  TASK_PRIORITY_ORDER,
} from "../../tasks/task-priority.js";

export type ChatConversationStatus =
  | "open"
  | "resolved"
  | "pending"
  | "snoozed";

const STATUS_OPTIONS: {
  value: ChatConversationStatus;
  label: string;
}[] = [
  { value: "open", label: "Open" },
  { value: "pending", label: "Pending" },
  { value: "snoozed", label: "Snoozed" },
  { value: "resolved", label: "Resolved" },
];

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function conversationLabel(row: ChatConversation): string {
  return (
    row.contactName?.trim() ||
    row.contactEmail?.trim() ||
    row.contactPhone?.trim() ||
    `Chat ${row.externalId}`
  );
}

export type ChatConversationDetailsViewProps = {
  conversation: ChatConversation;
  previousConversations?: readonly ChatConversation[];
  statusUpdating?: boolean;
  propertiesUpdating?: boolean;
  assigneeOptions?: SearchableDropdownOption<string>[];
  onStatusChange?: (status: ChatConversationStatus) => void | Promise<void>;
  onAssigneeChange?: (assigneeId: string | null) => void | Promise<void>;
  onPriorityChange?: (priority: number) => void | Promise<void>;
  onDueDateChange?: (dueDate: Date | null) => void | Promise<void>;
  onSelectConversation?: (conversationId: string) => void;
};

/**
 * Chat rail “Details” tab — status, assignee / priority / due, ids, and prior
 * threads with the same visitor.
 */
export function ChatConversationDetailsView({
  conversation,
  previousConversations = [],
  statusUpdating = false,
  propertiesUpdating = false,
  assigneeOptions = [],
  onStatusChange,
  onAssigneeChange,
  onPriorityChange,
  onDueDateChange,
  onSelectConversation,
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

  const priorityOptions = useMemo(
    () =>
      TASK_PRIORITY_ORDER.map((value) => ({
        value: String(value),
        label: getTaskPriorityLabel(value),
        icon: <TaskPriorityIcon priority={value} size={14} />,
      })),
    [],
  );

  const previous = useMemo(
    () =>
      [...previousConversations].sort((left, right) =>
        (right.lastActivityAt ?? right.updatedAt).localeCompare(
          left.lastActivityAt ?? left.updatedAt,
        ),
      ),
    [previousConversations],
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
    <div className="chat-conversation-details">
      <section className="chat-conversation-details__section">
        <h3 className="chat-conversation-details__heading">Properties</h3>
        <div className="entity-properties-stack">
          <PropertyDropdown
            value={conversation.status}
            options={STATUS_OPTIONS}
            onChange={(next) => {
              void onStatusChange?.(next as ChatConversationStatus);
            }}
            disabled={statusUpdating || !onStatusChange}
            searchPlaceholder="Change status…"
            ariaLabel="Conversation status"
            fallbackLabel={statusLabel}
            panelAlign="start"
            panelWidth={220}
          />
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
          <TaskDueDateDropdown
            dueDate={dueDate}
            status={taskStatus}
            variant="property"
            disabled={propertiesDisabled || !onDueDateChange}
            onDueDateChange={onDueDateChange}
          />
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
        </div>
      </section>

      <section className="chat-conversation-details__section">
        <h3 className="chat-conversation-details__heading">Conversation</h3>
        <dl className="chat-conversation-details__meta">
          <div className="chat-conversation-details__meta-row">
            <dt>ID</dt>
            <dd>
              <code className="chat-conversation-details__code">
                {conversation.id}
              </code>
              <button
                type="button"
                className="chat-conversation-details__copy"
                onClick={() => void copyValue("id", conversation.id)}
              >
                {copiedField === "id" ? "Copied" : "Copy"}
              </button>
            </dd>
          </div>
          <div className="chat-conversation-details__meta-row">
            <dt>Chatwoot</dt>
            <dd>
              <code className="chat-conversation-details__code">
                {conversation.externalId}
              </code>
              <button
                type="button"
                className="chat-conversation-details__copy"
                onClick={() =>
                  void copyValue("external", conversation.externalId)
                }
              >
                {copiedField === "external" ? "Copied" : "Copy"}
              </button>
            </dd>
          </div>
          {conversation.inboxName ? (
            <div className="chat-conversation-details__meta-row">
              <dt>Inbox</dt>
              <dd>{conversation.inboxName}</dd>
            </div>
          ) : null}
          {conversation.channelType ? (
            <div className="chat-conversation-details__meta-row">
              <dt>Channel</dt>
              <dd>{conversation.channelType}</dd>
            </div>
          ) : null}
        </dl>
      </section>

      <section className="chat-conversation-details__section">
        <h3 className="chat-conversation-details__heading">
          Previous conversations
        </h3>
        {previous.length === 0 ? (
          <p className="chat-conversation-details__empty">
            No earlier chats with this visitor.
          </p>
        ) : (
          <ul className="chat-conversation-details__previous">
            {previous.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  className="chat-conversation-details__previous-row"
                  onClick={() => onSelectConversation?.(row.id)}
                >
                  <span className="chat-conversation-details__previous-top">
                    <span className="chat-conversation-details__previous-name">
                      {conversationLabel(row)}
                    </span>
                    <span className="chat-conversation-details__previous-when">
                      {formatWhen(row.lastActivityAt)}
                    </span>
                  </span>
                  <span className="chat-conversation-details__previous-preview">
                    {row.lastMessagePreview?.trim() || row.status}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
