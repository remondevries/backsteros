"use client";

import type { CommunicationChatListRow } from "../../communication/communication-chat-list-row.js";
import type { InboxEmailListItem } from "../../inbox/inbox-items.js";
import type { TaskStatus } from "../../tasks/task-status.js";
import type { SearchableDropdownOption } from "../dropdowns/searchable-dropdown.js";
import {
  EmailPropertiesDisplay,
  type EmailPropertiesDisplayThread,
} from "../email/email-properties-display.js";
import { PreviousConversationsList } from "./previous-conversations-list.js";

export type EmailConversationDetailsViewProps = {
  item: InboxEmailListItem;
  previousItems?: readonly CommunicationChatListRow[];
  assigneeOptions?: SearchableDropdownOption<string>[];
  projectOptions?: SearchableDropdownOption<string>[];
  onStatusChange?: (status: TaskStatus) => void;
  onPriorityChange?: (priority: number) => void;
  onDueDateChange?: (dueDate: Date | null) => void;
  onAssigneeChange?: (assigneeId: string | null) => void;
  onProjectChange?: (projectKey: string | null) => void;
  onSelectConversation?: (conversationId: string) => void;
  onSelectEmail?: (emailId: string) => void;
  onSelectSupport?: (supportId: string) => void;
  onViewAllPrevious?: () => void;
};

function toThread(item: InboxEmailListItem): EmailPropertiesDisplayThread {
  return {
    assigneeId: item.assigneeId ?? null,
    assigneeName: item.assigneeName ?? null,
    projectKey: item.projectKey ?? null,
    projectName: item.projectName ?? null,
    status: item.status,
    priority: item.priority,
    dueDate: item.dueDate,
  };
}

/**
 * Chat rail “Details” tab — assignee / status / priority / due / project, plus
 * prior chats / emails / support for the same contact.
 */
export function EmailConversationDetailsView({
  item,
  previousItems = [],
  assigneeOptions = [],
  projectOptions = [],
  onStatusChange,
  onPriorityChange,
  onDueDateChange,
  onAssigneeChange,
  onProjectChange,
  onSelectConversation,
  onSelectEmail,
  onSelectSupport,
  onViewAllPrevious,
}: EmailConversationDetailsViewProps) {
  return (
    <div className="communication-chat-details entity-overview__details contact-details">
      <EmailPropertiesDisplay
        thread={toThread(item)}
        assigneeOptions={assigneeOptions}
        projectOptions={projectOptions}
        onStatusChange={onStatusChange}
        onPriorityChange={onPriorityChange}
        onDueDateChange={onDueDateChange}
        onAssigneeChange={onAssigneeChange}
        onProjectChange={onProjectChange}
        showPartyLinks={false}
        chrome="flat"
      />
      <PreviousConversationsList
        items={previousItems}
        storageKey="comm-email-details-previous"
        onSelectChat={onSelectConversation}
        onSelectEmail={onSelectEmail}
        onSelectSupport={onSelectSupport}
        onViewAll={onViewAllPrevious}
      />
    </div>
  );
}
