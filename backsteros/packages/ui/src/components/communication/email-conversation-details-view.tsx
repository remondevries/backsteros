"use client";

import type { InboxEmailListItem } from "../../inbox/inbox-items.js";
import type { TaskStatus } from "../../tasks/task-status.js";
import type { SearchableDropdownOption } from "../dropdowns/searchable-dropdown.js";
import {
  EmailPropertiesDisplay,
  type EmailPropertiesDisplayThread,
} from "../email/email-properties-display.js";

export type EmailConversationDetailsViewProps = {
  item: InboxEmailListItem;
  assigneeOptions?: SearchableDropdownOption<string>[];
  projectOptions?: SearchableDropdownOption<string>[];
  onStatusChange?: (status: TaskStatus) => void;
  onPriorityChange?: (priority: number) => void;
  onDueDateChange?: (dueDate: Date | null) => void;
  onAssigneeChange?: (assigneeId: string | null) => void;
  onProjectChange?: (projectKey: string | null) => void;
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
 * Chat rail “Details” tab — assignee / status / priority / due / project only.
 * Org and contact are linked per message on the party chrome, not here.
 */
export function EmailConversationDetailsView({
  item,
  assigneeOptions = [],
  projectOptions = [],
  onStatusChange,
  onPriorityChange,
  onDueDateChange,
  onAssigneeChange,
  onProjectChange,
}: EmailConversationDetailsViewProps) {
  return (
    <div className="communication-chat-details">
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
    </div>
  );
}
