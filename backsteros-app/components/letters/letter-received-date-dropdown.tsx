"use client";

import { useCallback, useMemo, useRef, useState, useTransition } from "react";

import { updateLetterReceivedDateAction } from "@/lib/mutations/letters";
import { updateLocalLetterReceivedDate } from "@/lib/sync/local-letter-mutations";
import { runEntityPersist } from "@/lib/sync/run-entity-persist";
import { PropertyDropdown } from "@/components/ui/property-dropdown";
import { SearchableDropdown } from "@/components/ui/searchable-dropdown";
import { TaskDueDateIcon } from "@/components/tasks/task-due-date-icon";
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
  formatTaskDueMetaLabel } from "@/lib/task-due-date";
import { openNativeDatePicker } from "@/lib/native-date-picker";

type LetterReceivedDateDropdownProps = {
  letterId: string;
  projectId: string | null;
  receivedDate: Date | null;
  variant: "property" | "list";
};

export function LetterReceivedDateDropdown({
  letterId,
  projectId,
  receivedDate: initialReceivedDate,
  variant }: LetterReceivedDateDropdownProps) {
  const [ymdValue, setYmdValue] = useState(() =>
    formatDueDateInputValue(initialReceivedDate),
  );
  const [error, setError] = useState<string | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isPending, startTransition] = useTransition();
  const dateInputRef = useRef<HTMLInputElement>(null);

  const [prevInitialReceivedDate, setPrevInitialReceivedDate] = useState(initialReceivedDate);
  if (initialReceivedDate !== prevInitialReceivedDate) {
    setPrevInitialReceivedDate(initialReceivedDate);
    setYmdValue(formatDueDateInputValue(initialReceivedDate));
  }

  const options = useMemo(
    () => buildTaskDueDateDropdownOptions(ymdValue || null),
    [ymdValue],
  );
  const selectedValue = taskDueDateDropdownValue(ymdValue || null);
  const displayLabel = ymdValue
    ? (formatTaskDueMetaLabel(ymdValue) ?? ymdValue)
    : "No received date";
  const hasReceivedDate = Boolean(ymdValue);

  const persist = useCallback(
    (nextYmd: string | null) => {
      const currentYmd = formatDueDateInputValue(initialReceivedDate) || null;
      const normalizedNext = nextYmd?.trim() || null;
      if (normalizedNext === currentYmd) return;

      const previousYmd = ymdValue;
      setYmdValue(normalizedNext ?? "");

      startTransition(async () => {
        setError(null);
        const result = await runEntityPersist(
          () =>
            updateLocalLetterReceivedDate({
              letterId,
              receivedDate: normalizedNext,
            }),
          () =>
            updateLetterReceivedDateAction({
              letterId,
              receivedDate: normalizedNext,
            }),
        );

        if (!result.ok) {
          setError(result.error);
          setYmdValue(previousYmd);
        }
      });
    },
    [initialReceivedDate, letterId, projectId, ymdValue],
  );

  function handleChange(value: string) {
    if (isPickDueDateValue(value)) {
      openNativeDatePicker(dateInputRef.current);
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

  if (variant === "property") {
    return (
      <div className="flex flex-col gap-1">
        <PropertyDropdown
          value={selectedValue}
          options={options}
          onChange={handleChange}
          disabled={isPending}
          searchPlaceholder="yesterday, last Monday…"
          searchShortcutLabel="R"
          ariaLabel="Change received date"
          fallbackIcon={<TaskDueDateIcon active={hasReceivedDate} urgency={null} />}
          fallbackLabel={displayLabel}
          mutedFallback={!hasReceivedDate}
          onQuerySubmit={handleQuerySubmit}
          queryPreviewLabel={handleQueryPreview}
          taskPropertyDropdownId="receivedDate"
        />
        <input
          ref={dateInputRef}
          type="date"
          value={ymdValue}
          onChange={(event) => {
            const next = event.target.value.trim();
            setYmdValue(next);
            persist(next ? next : null);
          }}
          className="fixed left-[-9999px] h-px w-px opacity-0"
          tabIndex={-1}
          aria-hidden="true"
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
        value={selectedValue}
        options={options}
        onChange={handleChange}
        disabled={isPending}
        searchPlaceholder="yesterday, last Monday…"
        searchShortcutLabel="R"
        ariaLabel={`Change received date: ${displayLabel}`}
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
              hasReceivedDate
                ? "border-white/10 text-foreground/60"
                : "border-dashed border-white/15 text-foreground/50"
            }`}
            disabled={disabled}
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-label={`Change received date: ${displayLabel}`}
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
            <TaskDueDateIcon
              size={14}
              active={hasReceivedDate || isHovered || open}
              urgency={null}
              className={
                hasReceivedDate
                  ? "shrink-0 text-foreground/50"
                  : "shrink-0 text-foreground/40"
              }
            />
            <span>{displayLabel}</span>
          </button>
        )}
      />
      <input
        ref={dateInputRef}
        type="date"
        value={ymdValue}
        onChange={(event) => {
          const next = event.target.value.trim();
          setYmdValue(next);
          persist(next ? next : null);
        }}
        className="fixed left-[-9999px] h-px w-px opacity-0"
        tabIndex={-1}
        aria-hidden="true"
      />
      {error ? (
        <p className="text-[11px] text-red-400" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
