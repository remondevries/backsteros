"use client";

import type { SearchableDropdownMenuApi } from "../searchable-dropdown-menu-api.js";
import type { TaskPropertyDropdownId } from "../task-property-dropdown-keys.js";
import {
  buildAssigneeDropdownOptions,
  DROPDOWN_NONE_VALUE,
  type AssigneeDropdownContact,
} from "./dropdown-options.js";
import { PropertyDropdown, type PropertyDropdownTriggerVariant } from "./property-dropdown.js";

export type ComposeAssigneeDropdownProps = {
  contacts: AssigneeDropdownContact[];
  value: string | null;
  onChange: (assigneeId: string | null) => void;
  disabled?: boolean;
  registerOpenMenu?: (api: SearchableDropdownMenuApi | null) => void;
  taskPropertyDropdownId?: TaskPropertyDropdownId;
  triggerVariant?: PropertyDropdownTriggerVariant;
};

/**
 * Task/compose assignee dropdown — matches Next's `TaskCreateAssigneeDropdown`,
 * built on `buildAssigneeDropdownOptions` already shared with the assignee
 * property panel elsewhere in `@backsteros/ui`.
 */
export function ComposeAssigneeDropdown({
  contacts,
  value,
  onChange,
  disabled = false,
  registerOpenMenu,
  taskPropertyDropdownId = "assignee",
  triggerVariant = "default",
}: ComposeAssigneeDropdownProps) {
  const options = buildAssigneeDropdownOptions(contacts);

  if (contacts.length === 0) {
    return null;
  }

  const dropdownValue = value ?? DROPDOWN_NONE_VALUE;
  const selectedContact = contacts.find((contact) => contact.id === value);
  const fallbackLabel = selectedContact?.name ?? "Unassigned";
  const fallbackIcon = options.find(
    (option) => option.value === dropdownValue,
  )?.icon ?? options[0]?.icon ?? null;

  return (
    <div className="shrink-0" onMouseDown={(event) => event.preventDefault()}>
      <PropertyDropdown
        value={dropdownValue}
        options={options}
        onChange={(nextValue) => {
          onChange(nextValue === DROPDOWN_NONE_VALUE ? null : nextValue);
        }}
        disabled={disabled}
        searchPlaceholder="Change assignee…"
        searchShortcutLabel="A"
        ariaLabel="Assignee"
        fallbackIcon={fallbackIcon}
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
