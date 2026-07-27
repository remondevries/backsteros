"use client";

import { useMemo, useState, useTransition } from "react";

import { updateProjectPriorityAction } from "@/lib/mutations/projects";
import { TaskPriorityIcon } from "@/components/task-priority/task-priority-icon";
import { updateLocalProjectPriority } from "@/lib/sync/local-project-mutations";
import { runEntityPersist } from "@/lib/sync/run-entity-persist";
import { SearchableDropdown } from "@/components/ui/searchable-dropdown";
import type { TaskPriority } from "@/lib/db/schema";
import {
  fromTaskPriorityDropdownValue,
  getTaskPriorityLabel,
  isTaskPriority,
  toTaskPriorityDropdownValue,
  type TaskPriorityDropdownValue } from "@/lib/task-priority";

import { buildTaskPriorityDropdownOptions } from "@/components/tasks/task-priority-dropdown-options";

type ProjectPriorityDropdownProps = {
  projectId: string;
  priority: number;
  onPriorityChange?: (priority: TaskPriority) => void;
};

export function ProjectPriorityDropdown({
  projectId,
  priority: initialPriority,
  onPriorityChange }: ProjectPriorityDropdownProps) {
  const [priority, setPriority] = useState(() =>
    toTaskPriorityDropdownValue(initialPriority),
  );
  const [error, setError] = useState<string | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [prevInitialPriority, setPrevInitialPriority] = useState(initialPriority);
  if (initialPriority !== prevInitialPriority) {
    setPrevInitialPriority(initialPriority);
    setPriority(toTaskPriorityDropdownValue(initialPriority));
  }

  const options = useMemo(() => buildTaskPriorityDropdownOptions(), []);
  const numericPriority = fromTaskPriorityDropdownValue(priority);
  const priorityLabel = getTaskPriorityLabel(numericPriority);

  function handleChange(nextPriority: TaskPriorityDropdownValue) {
    if (nextPriority === priority) return;

    const previousPriority = priority;
    const nextNumeric = fromTaskPriorityDropdownValue(nextPriority);
    setPriority(nextPriority);
    setError(null);
    if (isTaskPriority(nextNumeric)) {
      onPriorityChange?.(nextNumeric);
    }

    startTransition(async () => {
      const result = await runEntityPersist(
        () =>
          updateLocalProjectPriority({
            projectId,
            priority: nextNumeric,
          }),
        () =>
          updateProjectPriorityAction({
            projectId,
            priority: nextNumeric,
          }),
      );

      if (!result.ok) {
        setPriority(previousPriority);
        const previousNumeric = fromTaskPriorityDropdownValue(previousPriority);
        if (isTaskPriority(previousNumeric)) {
          onPriorityChange?.(previousNumeric);
        }
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col items-center">
      <SearchableDropdown
        value={priority}
        options={options}
        onChange={handleChange}
        disabled={isPending}
        searchPlaceholder="Change priority…"
        searchShortcutLabel="P"
        ariaLabel={`Change priority: ${priorityLabel}`}
        taskPropertyDropdownId="priority"
        className="inline-flex"
        panelWidth={280}
        panelAlign="start"
        renderTrigger={({ open, disabled, triggerId, onToggle }) => (
          <button
            type="button"
            id={triggerId}
            title={priorityLabel}
            tabIndex={-1}
            className="flex size-4 shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent p-0 disabled:cursor-not-allowed disabled:opacity-55"
            disabled={disabled}
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-label={`Change priority: ${priorityLabel}`}
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
            <TaskPriorityIcon
              priority={numericPriority}
              title={priorityLabel}
              highlighted={isHovered || open}
            />
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
