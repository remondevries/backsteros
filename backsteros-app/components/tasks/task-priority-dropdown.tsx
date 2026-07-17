"use client";

import { useMemo, useState, useTransition } from "react";

import { updateTaskPriorityAction } from "@/lib/mutations/tasks";
import { updateLocalTaskPriority } from "@/lib/sync/local-task-mutations";
import { runEntityPersist } from "@/lib/sync/run-entity-persist";
import { TaskPriorityIcon } from "@/components/task-priority/task-priority-icon";
import { PropertyDropdown } from "@/components/ui/property-dropdown";
import { SearchableDropdown } from "@/components/ui/searchable-dropdown";
import {
  fromTaskPriorityDropdownValue,
  getTaskPriorityLabel,
  toTaskPriorityDropdownValue,
  type TaskPriorityDropdownValue } from "@/lib/task-priority";

import { buildTaskPriorityDropdownOptions } from "./task-priority-dropdown-options";

type TaskPriorityDropdownProps = {
  taskId: string;
  projectId: string | null;
  priority: number;
  variant: "property" | "icon" | "list";
  disabled?: boolean;
};

export function TaskPriorityDropdown({
  taskId,
  projectId,
  priority: initialPriority,
  variant,
  disabled = false }: TaskPriorityDropdownProps) {
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
    if (disabled || nextPriority === priority) return;

    const previousPriority = priority;
    setPriority(nextPriority);
    setError(null);

    startTransition(async () => {
      const result = await runEntityPersist(
        () =>
          updateLocalTaskPriority({
            taskId,
            projectId,
            priority: fromTaskPriorityDropdownValue(nextPriority),
          }),
        () =>
          updateTaskPriorityAction({
            taskId,
            projectId,
            priority: fromTaskPriorityDropdownValue(nextPriority),
          }),
      );

      if (!result.ok) {
        setPriority(previousPriority);
        setError(result.error);
      }
    });
  }

  if (variant === "property") {
    return (
      <div className="flex flex-col gap-1">
        <PropertyDropdown
          value={priority}
          options={options}
          onChange={handleChange}
          disabled={disabled || isPending}
          searchPlaceholder="Change priority…"
          searchShortcutLabel="P"
          ariaLabel="Change priority"
          taskPropertyDropdownId="priority"
          fallbackIcon={
            <TaskPriorityIcon
              priority={numericPriority}
              title={priorityLabel}
              size={14}
            />
          }
          fallbackLabel={priorityLabel}
          mutedFallback={numericPriority === 0}
        />
        {error ? (
          <p className="px-1 text-[11px] text-red-400" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  if (variant === "list") {
    return (
      <div className="flex flex-col">
        <SearchableDropdown
          value={priority}
          options={options}
          onChange={handleChange}
          disabled={disabled || isPending}
          searchPlaceholder="Change priority…"
          searchShortcutLabel="P"
          ariaLabel={`Change priority: ${priorityLabel}`}
          taskPropertyDropdownId="priority"
          className="inline-flex shrink-0"
          panelWidth={280}
          panelAlign="start"
          renderTrigger={({ open, disabled, triggerId, onToggle }) => (
            <button
              type="button"
              id={triggerId}
              title={priorityLabel}
              className={`inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-full border-0 bg-transparent p-0 text-xs leading-none transition-colors hover:bg-white/[0.03] disabled:cursor-not-allowed disabled:opacity-55 ${
                isHovered || open ? "text-foreground/70" : "text-foreground/50"
              }`}
              disabled={disabled}
              aria-haspopup="listbox"
              aria-expanded={open}
              aria-label={`Change priority: ${priorityLabel}`}
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.preventDefault();
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
                highlighted={isHovered || open}
                size={14}
              />
              <span>{priorityLabel}</span>
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

  return (
    <div className="flex flex-col">
      <SearchableDropdown
        value={priority}
        options={options}
        onChange={handleChange}
        disabled={disabled || isPending}
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
