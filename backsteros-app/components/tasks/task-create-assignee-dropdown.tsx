"use client";

import {
  getAssigneeFallbackIcon,
  useAssigneeDropdownOptions,
} from "@/components/contacts/assignee-dropdown-options";
import { PropertyDropdown } from "@/components/ui/property-dropdown";
import type { SearchableDropdownMenuApi } from "@/components/ui/searchable-dropdown-menu-api";
import {
  TASK_ASSIGNEE_UNASSIGNED,
  type AssignableContact,
} from "@/lib/contacts/assignable-contact";

import type { TaskPropertyDropdownId } from "@/lib/shortcuts/task-property-dropdown-keys";

type TaskCreateAssigneeDropdownProps = {
  contacts: AssignableContact[];
  value: string | null;
  onChange: (assigneeId: string | null) => void;
  disabled?: boolean;
  registerOpenMenu?: (api: SearchableDropdownMenuApi | null) => void;
  taskPropertyDropdownId?: TaskPropertyDropdownId;
  triggerVariant?: "default" | "composePill";
};

export function TaskCreateAssigneeDropdown({
  contacts,
  value,
  onChange,
  disabled = false,
  registerOpenMenu,
  taskPropertyDropdownId = "assignee",
  triggerVariant = "default",
}: TaskCreateAssigneeDropdownProps) {
  const options = useAssigneeDropdownOptions(contacts);

  if (contacts.length === 0) {
    return null;
  }
  const dropdownValue = value ?? TASK_ASSIGNEE_UNASSIGNED;
  const selectedContact = contacts.find((contact) => contact.id === value);
  const fallbackLabel = selectedContact?.name ?? "Unassigned";

  return (
    <div
      className="shrink-0"
      onMouseDown={(event) => event.preventDefault()}
    >
      <PropertyDropdown
        value={dropdownValue}
        options={options}
        onChange={(nextValue) => {
          onChange(
            nextValue === TASK_ASSIGNEE_UNASSIGNED ? null : nextValue,
          );
        }}
        disabled={disabled}
        searchPlaceholder="Change assignee…"
        searchShortcutLabel="A"
        ariaLabel="Assignee"
        fallbackIcon={getAssigneeFallbackIcon(selectedContact)}
        fallbackLabel={fallbackLabel}
        mutedFallback={!value}
        panelAlign="end"
        panelWidth={260}
        registerOpenMenu={registerOpenMenu}
        taskPropertyDropdownId={taskPropertyDropdownId}
        triggerVariant={triggerVariant}
      />
    </div>
  );
}
