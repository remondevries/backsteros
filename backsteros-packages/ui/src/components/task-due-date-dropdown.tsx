"use client";

import { useCallback, useMemo, useRef, useState, type SyntheticEvent } from "react";

import { DueDateCalendarPopover } from "./due-date-calendar-popover.js";
import {
  naturalLanguageDueDatePreview,
  parseNaturalLanguageDueDate,
} from "../parse-natural-language-due-date.js";
import {
  buildTaskDueDateDropdownOptions,
  isPickDueDateValue,
  taskDueDateDropdownValue,
  taskDueDateFromDropdownValue,
} from "../task-due-date-dropdown.js";
import {
  formatDueDateInputValue,
  formatTaskDueMetaLabel,
  getTaskDueDateUrgency,
  parseDueDateInputValue,
} from "../task-due-date.js";
import type { TaskPropertyDropdownId } from "../task-property-dropdown-keys.js";
import { PropertyDropdown } from "./property-dropdown.js";
import { SearchableDropdown } from "./searchable-dropdown.js";
import { TaskDueDateIcon } from "./task-due-date-icon.js";

export type TaskDueDateDropdownProps = {
  dueDate: Date | number | string | null | undefined;
  status?: string | null;
  variant?: "property" | "list" | "icon";
  disabled?: boolean;
  onDueDateChange?: (dueDate: Date | null) => void;
  noDueDateLabel?: string;
  /** Override search field placeholder (default due-date phrasing). */
  searchPlaceholder?: string;
  /** Override shortcut hint in search field. */
  searchShortcutLabel?: string;
  /**
   * Hotkey target id (`dueDate` default). Use `startDate` / `receivedDate`
   * when this control is reused for those fields (Next parity).
   */
  taskPropertyDropdownId?: TaskPropertyDropdownId;
  /** When false, list/property triggers omit the calendar icon (Next list/board). */
  showIcon?: boolean;
};

function stopFieldEvent(event: SyntheticEvent) {
  event.preventDefault();
  event.stopPropagation();
}

/**
 * Presentational due-date dropdown (presets + pick date + NL Enter).
 * Hosts own persistence via `onDueDateChange`.
 */
export function TaskDueDateDropdown({
  dueDate,
  status = null,
  variant = "property",
  disabled = false,
  onDueDateChange,
  noDueDateLabel = "No due date",
  searchPlaceholder = "tomorrow, next Friday, 2 weeks ago…",
  searchShortcutLabel = "⇧D",
  taskPropertyDropdownId = "dueDate",
  showIcon = true,
}: TaskDueDateDropdownProps) {
  const [ymdValue, setYmdValue] = useState(() =>
    formatDueDateInputValue(dueDate),
  );
  const [isHovered, setIsHovered] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);

  const [prevDueDate, setPrevDueDate] = useState(dueDate);
  if (dueDate !== prevDueDate) {
    setPrevDueDate(dueDate);
    setYmdValue(formatDueDateInputValue(dueDate));
  }

  const options = useMemo(
    () =>
      buildTaskDueDateDropdownOptions(
        ymdValue || null,
        new Date(),
        noDueDateLabel,
      ),
    [noDueDateLabel, ymdValue],
  );
  const selectedValue = taskDueDateDropdownValue(ymdValue || null);
  const displayLabel = ymdValue
    ? (formatTaskDueMetaLabel(ymdValue) ?? ymdValue)
    : noDueDateLabel;
  const hasDueDate = Boolean(ymdValue);
  const dueDateUrgency = useMemo(
    () => getTaskDueDateUrgency(ymdValue || null, new Date(), { status }),
    [status, ymdValue],
  );

  const applyYmd = useCallback(
    (nextYmd: string | null) => {
      if (disabled) return;
      const normalized = nextYmd?.trim() || null;
      const current = formatDueDateInputValue(dueDate) || null;
      if (normalized === current && normalized === (ymdValue || null)) return;
      setYmdValue(normalized ?? "");
      onDueDateChange?.(
        normalized ? parseDueDateInputValue(normalized) : null,
      );
    },
    [disabled, dueDate, onDueDateChange, ymdValue],
  );

  function handleChange(value: string) {
    if (disabled) return;
    if (isPickDueDateValue(value)) {
      setCalendarOpen(true);
      return;
    }
    applyYmd(taskDueDateFromDropdownValue(value));
  }

  const handleQuerySubmit = useCallback(
    (query: string) => {
      const result = parseNaturalLanguageDueDate(query);
      if (result.kind === "clear") {
        applyYmd(null);
        return true;
      }
      if (result.kind === "date") {
        applyYmd(result.ymd);
        return true;
      }
      return false;
    },
    [applyYmd],
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
      disabled={disabled}
      anchorRef={anchorRef}
      align={variant === "property" ? "start" : "end"}
      onSelect={(ymd) => applyYmd(ymd)}
    />
  );

  if (variant === "property") {
    return (
      <div className="task-due-date-dropdown" ref={anchorRef}>
        <PropertyDropdown
          value={selectedValue}
          options={options}
          onChange={handleChange}
          disabled={disabled}
          searchPlaceholder={searchPlaceholder}
          searchShortcutLabel={searchShortcutLabel}
          ariaLabel="Change due date"
          taskPropertyDropdownId={taskPropertyDropdownId}
          fallbackIcon={
            showIcon ? (
              <TaskDueDateIcon active={hasDueDate} urgency={dueDateUrgency} />
            ) : undefined
          }
          fallbackLabel={displayLabel}
          mutedFallback={!hasDueDate}
          onQuerySubmit={handleQuerySubmit}
          queryPreviewLabel={handleQueryPreview}
        />
        {calendarPopover}
      </div>
    );
  }

  return (
    <div className="task-due-date-dropdown" ref={anchorRef}>
      <SearchableDropdown
        value={selectedValue}
        options={options}
        onChange={handleChange}
        disabled={disabled}
        searchPlaceholder={searchPlaceholder}
        searchShortcutLabel={searchShortcutLabel}
        ariaLabel={`Change due date: ${displayLabel}`}
        taskPropertyDropdownId={taskPropertyDropdownId}
        className="task-due-date-dropdown__searchable"
        panelWidth={280}
        panelAlign={variant === "icon" ? "start" : "end"}
        onQuerySubmit={handleQuerySubmit}
        queryPreviewLabel={handleQueryPreview}
        renderTrigger={({ open, disabled: isDisabled, triggerId, onToggle }) =>
          variant === "icon" ? (
            <button
              type="button"
              id={triggerId}
              title={displayLabel}
              className="task-overview-row__icon-trigger"
              tabIndex={-1}
              disabled={isDisabled}
              aria-haspopup="listbox"
              aria-expanded={open}
              aria-label={`Change due date: ${displayLabel}`}
              onMouseDown={stopFieldEvent}
              onClick={(event) => {
                stopFieldEvent(event);
                onToggle();
              }}
            >
              <TaskDueDateIcon
                size={14}
                active={hasDueDate || isHovered || open}
                urgency={hasDueDate ? dueDateUrgency : null}
              />
            </button>
          ) : (
            <button
              type="button"
              id={triggerId}
              title={displayLabel}
              className={[
                "task-due-date-dropdown__list-trigger",
                hasDueDate ? "is-set" : "is-empty",
              ].join(" ")}
              disabled={isDisabled}
              aria-haspopup="listbox"
              aria-expanded={open}
              aria-label={`Change due date: ${displayLabel}`}
              onMouseDown={stopFieldEvent}
              onClick={(event) => {
                stopFieldEvent(event);
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
                />
              ) : null}
              <span className="task-due-date-dropdown__list-trigger-label">
                {displayLabel}
              </span>
            </button>
          )
        }
      />
      {calendarPopover}
    </div>
  );
}
