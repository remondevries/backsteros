"use client";

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type SyntheticEvent,
} from "react";

import { DueDateCalendarPopover } from "./due-date-calendar-popover.js";
import {
  naturalLanguageDueDatePreview,
  parseNaturalLanguageDueDate,
} from "../../tasks/parse-natural-language-due-date.js";
import {
  buildTaskDueDateDropdownOptions,
  isPickDueDateValue,
  taskDueDateDropdownValue,
  taskDueDateFromDropdownValue,
} from "../../tasks/task-due-date-dropdown.js";
import {
  formatDueDateInputValue,
  formatDueDateTimeStamp,
  formatTaskDueMetaLabel,
  getTaskDueDateUrgency,
  parseDueDateInputValue,
} from "../../tasks/task-due-date.js";
import { formatBirthdayLabel } from "../../contacts/birthday.js";
import type { TaskPropertyDropdownId } from "../../tasks/task-property-dropdown-keys.js";
import {
  getPreferredColorSchemeSnapshot,
  subscribeToPreferredColorScheme,
} from "../../tasks/task-status-color.js";
import { PropertyDropdown } from "../dropdowns/property-dropdown.js";
import { SearchableDropdown } from "../dropdowns/searchable-dropdown.js";
import {
  resolveTaskDueDateUrgencyColor,
  TaskDueDateIcon,
} from "./task-due-date-icon.js";

export type TaskDueDateDropdownProps = {
  dueDate: Date | number | string | null | undefined;
  status?: string | null;
  variant?: "property" | "list" | "icon";
  disabled?: boolean;
  onDueDateChange?: (dueDate: Date | null) => void;
  noDueDateLabel?: string;
  /** When false, omit “No due date” and ignore NL clear (habit next-due). */
  allowClear?: boolean;
  /** Override search field placeholder (default due-date phrasing). */
  searchPlaceholder?: string;
  /** Override shortcut hint in search field. */
  searchShortcutLabel?: string;
  /**
   * Hotkey target id (`dueDate` default). Use `startDate` / `receivedDate`
   * when this control is reused for those fields (Next parity).
   * Pass `null` to omit the hotkey target (e.g. bulk bar with a single row selected).
   */
  taskPropertyDropdownId?: TaskPropertyDropdownId | null;
  /** When false, list/property triggers omit the calendar icon (Next list/board). */
  showIcon?: boolean;
  /** Replaces the default calendar due-date icon when `showIcon` is true. */
  icon?: ReactNode;
  /**
   * `relative` (default) = Today / Tomorrow / etc.
   * `ymd` = always `YYYY-MM-DD`.
   * `ymd-time` = always `YYYY-MM-DD @ HH:MM:SS` (local).
   * `long` = always `28 Aug 1990` (includes year).
   */
  labelFormat?: "relative" | "ymd" | "ymd-time" | "long";
  /** Property-variant trigger chrome (`inlineChip` matches mobile detail chips). */
  triggerVariant?: import("../dropdowns/property-dropdown.js").PropertyDropdownTriggerVariant;
  /** Open the panel on mount (used by deferred list-row mounts). */
  defaultOpen?: boolean;
  /** Placement for the initial `defaultOpen` (deferred shortcut opens). */
  defaultOpenPlacement?: "anchored" | "center";
  /** Tab from the open search field (e.g. move focus to the next row field). */
  onTabFromSearch?: () => void;
  /** Shift+Tab from the open search field. */
  onShiftTabFromSearch?: () => void;
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
  allowClear = true,
  searchPlaceholder = "tomorrow, yesterday, 2 weeks ago…",
  searchShortcutLabel = "⇧D",
  taskPropertyDropdownId,
  showIcon = true,
  icon,
  labelFormat = "relative",
  triggerVariant = "default",
  defaultOpen = false,
  defaultOpenPlacement,
  onTabFromSearch,
  onShiftTabFromSearch,
}: TaskDueDateDropdownProps) {
  const resolvedTaskPropertyDropdownId =
    taskPropertyDropdownId === undefined ? "dueDate" : taskPropertyDropdownId;
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
        { allowClear },
      ),
    [allowClear, noDueDateLabel, ymdValue],
  );
  const selectedValue = taskDueDateDropdownValue(ymdValue || null);
  const displayLabel = ymdValue
    ? labelFormat === "ymd-time"
      ? formatDueDateTimeStamp(dueDate) || ymdValue
      : labelFormat === "ymd"
        ? ymdValue
        : labelFormat === "long"
          ? (formatBirthdayLabel(ymdValue) ?? ymdValue)
          : (formatTaskDueMetaLabel(ymdValue) ?? ymdValue)
    : noDueDateLabel;
  const hasDueDate = Boolean(ymdValue);
  const dueDateUrgency = useMemo(
    () => getTaskDueDateUrgency(ymdValue || null, new Date(), { status }),
    [status, ymdValue],
  );
  const colorScheme = useSyncExternalStore(
    subscribeToPreferredColorScheme,
    getPreferredColorSchemeSnapshot,
    () => "dark" as const,
  );
  // Past due only (yesterday or older) — not "Today".
  const lateLabelColor =
    hasDueDate && dueDateUrgency === "overdue"
      ? resolveTaskDueDateUrgencyColor(dueDateUrgency, colorScheme)
      : undefined;

  const dueDateIcon = showIcon
    ? (icon ?? (
        <TaskDueDateIcon active={hasDueDate} urgency={dueDateUrgency} />
      ))
    : undefined;

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
        if (!allowClear) return false;
        applyYmd(null);
        return true;
      }
      if (result.kind === "date") {
        applyYmd(result.ymd);
        return true;
      }
      return false;
    },
    [allowClear, applyYmd],
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
          taskPropertyDropdownId={resolvedTaskPropertyDropdownId ?? undefined}
          defaultOpen={defaultOpen}
          defaultOpenPlacement={defaultOpenPlacement}
          fallbackIcon={dueDateIcon}
          fallbackLabel={displayLabel}
          mutedFallback={!hasDueDate}
          triggerVariant={triggerVariant}
          onQuerySubmit={handleQuerySubmit}
          queryPreviewLabel={handleQueryPreview}
          onTabFromSearch={onTabFromSearch}
          onShiftTabFromSearch={onShiftTabFromSearch}
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
        taskPropertyDropdownId={resolvedTaskPropertyDropdownId ?? undefined}
        className="task-due-date-dropdown__searchable"
        panelWidth={280}
        panelAlign={variant === "icon" ? "start" : "end"}
        defaultOpen={defaultOpen}
        defaultOpenPlacement={defaultOpenPlacement}
        onQuerySubmit={handleQuerySubmit}
        queryPreviewLabel={handleQueryPreview}
        onTabFromSearch={onTabFromSearch}
        onShiftTabFromSearch={onShiftTabFromSearch}
        renderTrigger={({ open, disabled: isDisabled, triggerId, onToggle }) =>
          variant === "icon" ? (
            <button
              type="button"
              id={triggerId}
              title={displayLabel}
              className="task-item-row__icon-trigger"
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
                lateLabelColor ? "is-late" : null,
              ]
                .filter(Boolean)
                .join(" ")}
              style={lateLabelColor ? { color: lateLabelColor } : undefined}
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
