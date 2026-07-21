"use client";

import { useCallback, useMemo, useRef, useState, useTransition } from "react";

import { DueDateCalendarPopover } from "@backsteros/ui";
import { updateProjectDueDateAction } from "@/lib/mutations/projects";
import { SearchableDropdown } from "@/components/ui/searchable-dropdown";
import { updateLocalProjectDueDate } from "@/lib/sync/local-project-mutations";
import { runEntityPersist } from "@/lib/sync/run-entity-persist";
import {
  naturalLanguageDueDatePreview,
  parseNaturalLanguageDueDate } from "@/lib/parse-natural-language-due-date";
import {
  buildTaskDueDateDropdownOptions,
  isPickDueDateValue,
  taskDueDateDropdownValue,
  taskDueDateFromDropdownValue } from "@/lib/task-due-date-dropdown";
import {
  formatDueDateInputValue,
  formatTaskDueMetaLabel,
  getTaskDueDateUrgency,
  parseDueDateInputValue } from "@/lib/task-due-date";

import { TaskDueDateIcon } from "@/components/tasks/task-due-date-icon";

type ProjectDueDateDropdownProps = {
  projectId: string;
  dueDate: Date | null;
  status?: string | null;
  onDueDateChange?: (dueDate: Date | null) => void;
  showIcon?: boolean;
};

export function ProjectDueDateDropdown({
  projectId,
  dueDate: initialDueDate,
  status = null,
  onDueDateChange,
  showIcon = true }: ProjectDueDateDropdownProps) {
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
            updateLocalProjectDueDate({
              projectId,
              dueDate: normalizedNext,
            }),
          () =>
            updateProjectDueDateAction({
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
    [initialDueDate, onDueDateChange, projectId, ymdValue],
  );

  function handleChange(value: string) {
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

  return (
    <div className="flex min-w-0 flex-col" ref={anchorRef}>
      <SearchableDropdown
        value={selectedValue}
        options={options}
        onChange={handleChange}
        disabled={isPending}
        searchPlaceholder="tomorrow, next Friday, 2 weeks ago…"
        searchShortcutLabel="D"
        ariaLabel={`Change due date: ${displayLabel}`}
        taskPropertyDropdownId="dueDate"
        className="inline-flex min-w-0 max-w-full"
        panelWidth={280}
        panelAlign="end"
        onQuerySubmit={handleQuerySubmit}
        queryPreviewLabel={handleQueryPreview}
        renderTrigger={({ open, disabled, triggerId, onToggle }) => (
          <button
            type="button"
            id={triggerId}
            title={displayLabel}
            className={`inline-flex min-w-0 max-w-full cursor-pointer items-center gap-1 rounded-full bg-transparent px-2 py-0.5 text-xs leading-none transition-colors hover:bg-white/[0.03] disabled:cursor-not-allowed disabled:opacity-55 ${
              hasDueDate
                ? showIcon
                  ? "border border-white/10 text-foreground/60"
                  : "border-0 text-foreground/60"
                : "border border-dashed border-white/15 text-foreground/50"
            }`}
            disabled={disabled}
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-label={`Change due date: ${displayLabel}`}
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
            {showIcon ? (
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
            ) : null}
            <span className="truncate">{displayLabel}</span>
          </button>
        )}
      />
      <DueDateCalendarPopover
        open={calendarOpen}
        onClose={() => setCalendarOpen(false)}
        value={ymdValue || null}
        disabled={isPending}
        anchorRef={anchorRef}
        align="end"
        onSelect={(ymd) => {
          setYmdValue(ymd);
          persist(ymd);
        }}
      />
      {error ? (
        <p className="text-[11px] text-red-400" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
