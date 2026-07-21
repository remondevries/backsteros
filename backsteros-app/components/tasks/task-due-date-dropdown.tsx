"use client";

import { useCallback, useMemo, useRef, useState, useTransition } from "react";

import { DueDateCalendarPopover } from "@backsteros/ui";
import { updateTaskDueDateAction } from "@/lib/mutations/tasks";
import { updateLocalTaskDueDate } from "@/lib/sync/local-task-mutations";
import { runEntityPersist } from "@/lib/sync/run-entity-persist";
import { PropertyDropdown } from "@/components/ui/property-dropdown";
import { SearchableDropdown } from "@/components/ui/searchable-dropdown";
import {
  naturalLanguageDueDatePreview,
  parseNaturalLanguageDueDate,
} from "@/lib/parse-natural-language-due-date";
import {
  buildTaskDueDateDropdownOptions,
  isPickDueDateValue,
  taskDueDateDropdownValue,
  taskDueDateFromDropdownValue,
} from "@/lib/task-due-date-dropdown";
import {
  formatDueDateInputValue,
  formatTaskDueMetaLabel,
  getTaskDueDateUrgency,
  parseDueDateInputValue,
} from "@/lib/task-due-date";

import { TaskDueDateIcon } from "./task-due-date-icon";

type TaskDueDateDropdownProps = {
  taskId: string;
  projectId: string | null;
  dueDate: Date | null;
  status?: string | null;
  variant: "property" | "list";
  disabled?: boolean;
  onDueDateChange?: (dueDate: Date | null) => void;
};

export function TaskDueDateDropdown({
  taskId,
  projectId,
  dueDate: initialDueDate,
  status = null,
  variant,
  disabled = false,
  onDueDateChange,
}: TaskDueDateDropdownProps) {
  const [ymdValue, setYmdValue] = useState(() =>
    formatDueDateInputValue(initialDueDate),
  );
  const [error, setError] = useState<string | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const anchorRef = useRef<HTMLDivElement>(null);

  const [prevInitialDueDate, setPrevInitialDueDate] = useState(initialDueDate);
  if (initialDueDate !== prevInitialDueDate) {
    setPrevInitialDueDate(initialDueDate);
    setYmdValue(formatDueDateInputValue(initialDueDate));
  }

  const options = useMemo(
    () => buildTaskDueDateDropdownOptions(ymdValue || null),
    [ymdValue],
  );
  const selectedValue = taskDueDateDropdownValue(ymdValue || null);
  const displayLabel = ymdValue
    ? (formatTaskDueMetaLabel(ymdValue) ?? ymdValue)
    : "No due date";
  const hasDueDate = Boolean(ymdValue);
  const dueDateUrgency = useMemo(
    () => getTaskDueDateUrgency(ymdValue || null, new Date(), { status }),
    [status, ymdValue],
  );

  const persist = useCallback(
    (nextYmd: string | null) => {
      if (disabled) return;

      const currentYmd = formatDueDateInputValue(initialDueDate) || null;
      const normalizedNext = nextYmd?.trim() || null;
      if (normalizedNext === currentYmd) return;

      const previousYmd = ymdValue;
      setYmdValue(normalizedNext ?? "");
      onDueDateChange?.(
        normalizedNext ? parseDueDateInputValue(normalizedNext) : null,
      );

      startTransition(async () => {
        setError(null);
        const result = await runEntityPersist(
          () =>
            updateLocalTaskDueDate({
              taskId,
              projectId,
              dueDate: normalizedNext,
            }),
          () =>
            updateTaskDueDateAction({
              taskId,
              projectId,
              dueDate: normalizedNext,
            }),
        );

        if (!result.ok) {
          setError(result.error);
          setYmdValue(previousYmd);
          onDueDateChange?.(
            previousYmd ? parseDueDateInputValue(previousYmd) : null,
          );
        }
      });
    },
    [disabled, initialDueDate, onDueDateChange, projectId, taskId, ymdValue],
  );

  function handleChange(value: string) {
    if (disabled) return;

    if (isPickDueDateValue(value)) {
      setCalendarOpen(true);
      return;
    }

    const next = taskDueDateFromDropdownValue(value);
    setYmdValue(next ?? "");
    persist(next);
  }

  const handleQuerySubmit = useCallback(
    (query: string) => {
      const result = parseNaturalLanguageDueDate(query);
      if (result.kind === "clear") {
        setYmdValue("");
        persist(null);
        return true;
      }
      if (result.kind === "date") {
        setYmdValue(result.ymd);
        persist(result.ymd);
        return true;
      }
      return false;
    },
    [persist],
  );

  const handleQueryPreview = useCallback(
    (query: string) => naturalLanguageDueDatePreview(query),
    [],
  );

  const calendarPopover = (
    <DueDateCalendarPopover
      open={calendarOpen}
      onClose={() => setCalendarOpen(false)}
      value={ymdValue || null}
      disabled={disabled || isPending}
      anchorRef={anchorRef}
      align={variant === "property" ? "start" : "end"}
      onSelect={(ymd) => {
        setYmdValue(ymd);
        persist(ymd);
      }}
    />
  );

  if (variant === "property") {
    return (
      <div className="flex flex-col gap-1" ref={anchorRef}>
        <PropertyDropdown
          value={selectedValue}
          options={options}
          onChange={handleChange}
          disabled={disabled || isPending}
          searchPlaceholder="tomorrow, next Friday, 2 weeks ago…"
          searchShortcutLabel="⇧D"
          ariaLabel="Change due date"
          taskPropertyDropdownId="dueDate"
          fallbackIcon={
            <TaskDueDateIcon active={hasDueDate} urgency={dueDateUrgency} />
          }
          fallbackLabel={displayLabel}
          mutedFallback={!hasDueDate}
          onQuerySubmit={handleQuerySubmit}
          queryPreviewLabel={handleQueryPreview}
        />
        {calendarPopover}
        {error ? (
          <p className="px-1 text-[11px] text-red-400" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col" ref={anchorRef}>
      <SearchableDropdown
        value={selectedValue}
        options={options}
        onChange={handleChange}
        disabled={disabled || isPending}
        searchPlaceholder="tomorrow, next Friday, 2 weeks ago…"
        searchShortcutLabel="⇧D"
        ariaLabel={`Change due date: ${displayLabel}`}
        taskPropertyDropdownId="dueDate"
        className="inline-flex shrink-0"
        panelWidth={280}
        panelAlign="end"
        onQuerySubmit={handleQuerySubmit}
        queryPreviewLabel={handleQueryPreview}
        renderTrigger={({ open, disabled, triggerId, onToggle }) => (
          <button
            type="button"
            id={triggerId}
            title={displayLabel}
            className={`inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-full border bg-transparent px-2 py-0.5 text-xs leading-none transition-colors hover:bg-white/[0.03] disabled:cursor-not-allowed disabled:opacity-55 ${
              hasDueDate
                ? "border-white/10 text-foreground/60"
                : "border-dashed border-white/15 text-foreground/50"
            }`}
            disabled={disabled}
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-label={`Change due date: ${displayLabel}`}
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
            <TaskDueDateIcon
              size={14}
              active={hasDueDate || isHovered || open}
              urgency={hasDueDate ? dueDateUrgency : null}
              className={
                hasDueDate
                  ? "shrink-0 text-foreground/50"
                  : "shrink-0 text-foreground/40"
              }
            />
            <span>{displayLabel}</span>
          </button>
        )}
      />
      {calendarPopover}
      {error ? (
        <p className="text-[11px] text-red-400" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
