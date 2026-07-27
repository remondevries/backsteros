"use client";

import { useState, useTransition } from "react";

import { updateTaskAssigneeAction } from "@/lib/mutations/tasks";
import {
  getAssigneeFallbackIcon,
  useAssigneeDropdownOptions } from "@/components/contacts/assignee-dropdown-options";
import { AssigneeContactIcon } from "@/components/contacts/assignee-contact-icon";
import { ContactPersonIcon } from "@/components/icons/contact-person-icon";
import { PropertyDropdown } from "@/components/ui/property-dropdown";
import { SearchableDropdown } from "@/components/ui/searchable-dropdown";
import {
  TASK_ASSIGNEE_UNASSIGNED,
  type AssignableContact } from "@/lib/contacts/assignable-contact";

type TaskAssigneeDropdownProps = {
  taskId: string;
  projectId: string | null;
  assigneeId: string | null;
  contacts: AssignableContact[];
  variant: "property" | "icon";
};

export function TaskAssigneeDropdown({
  taskId,
  projectId,
  assigneeId: initialAssigneeId,
  contacts,
  variant }: TaskAssigneeDropdownProps) {
  const [assigneeId, setAssigneeId] = useState(initialAssigneeId);
  const [error, setError] = useState<string | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [prevInitialAssigneeId, setPrevInitialAssigneeId] = useState(initialAssigneeId);
  if (initialAssigneeId !== prevInitialAssigneeId) {
    setPrevInitialAssigneeId(initialAssigneeId);
    setAssigneeId(initialAssigneeId);
  }

  const options = useAssigneeDropdownOptions(contacts);
  const dropdownValue = assigneeId ?? TASK_ASSIGNEE_UNASSIGNED;
  const selectedContact = contacts.find((contact) => contact.id === assigneeId);
  const fallbackLabel = selectedContact?.name ?? "Unassigned";

  function handleChange(nextValue: string) {
    const normalized =
      nextValue === TASK_ASSIGNEE_UNASSIGNED ? null : nextValue;

    if (normalized === assigneeId) {
      return;
    }

    const previousAssigneeId = assigneeId;
    setAssigneeId(normalized);
    setError(null);

    startTransition(async () => {
      const result = await updateTaskAssigneeAction({
        taskId,
        projectId,
        assigneeId: normalized });

      if (!result.ok) {
        setAssigneeId(previousAssigneeId);
        setError(result.error);
      }
    });
  }

  if (contacts.length === 0) {
    return null;
  }

  if (variant === "property") {
    return (
      <div className="flex flex-col gap-1">
        <PropertyDropdown
          value={dropdownValue}
          options={options}
          onChange={handleChange}
          disabled={isPending}
          searchPlaceholder="Change assignee…"
          searchShortcutLabel="A"
          ariaLabel="Change assignee"
          taskPropertyDropdownId="assignee"
          fallbackIcon={getAssigneeFallbackIcon(selectedContact)}
          fallbackLabel={fallbackLabel}
          mutedFallback={!assigneeId}
          panelAlign="start"
        />
        {error ? (
          <p className="px-1 text-[11px] text-red-400" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <SearchableDropdown
        value={dropdownValue}
        options={options}
        onChange={handleChange}
        disabled={isPending}
        searchPlaceholder="Change assignee…"
        searchShortcutLabel="A"
        ariaLabel={`Change assignee: ${fallbackLabel}`}
        taskPropertyDropdownId="assignee"
        className="inline-flex"
        panelWidth={260}
        panelAlign="end"
        renderTrigger={({ open, disabled, triggerId, onToggle }) => (
          <button
            type="button"
            id={triggerId}
            title={fallbackLabel}
            className="task-kanban-card-owner flex size-[18px] shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border-0 bg-transparent p-0 disabled:cursor-not-allowed disabled:opacity-55"
            disabled={disabled}
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-label={`Change assignee: ${fallbackLabel}`}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onToggle();
            }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onFocus={() => setIsHovered(true)}
            onBlur={() => setIsHovered(false)}
          >
            {selectedContact ? (
              <AssigneeContactIcon contact={selectedContact} size={14} />
            ) : (
              <ContactPersonIcon
                size={14}
                className={
                  isHovered || open
                    ? "text-foreground/80"
                    : "text-foreground/45"
                }
              />
            )}
          </button>
        )}
      />
      {error ? (
        <p className="text-[11px] text-red-400" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
