"use client";

import {
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type SyntheticEvent,
} from "react";

import {
  consumeSearchableDropdownOpenPlacement,
  type SearchableDropdownOpenPlacement,
} from "../../dropdowns/searchable-dropdown-open-placement.js";
import {
  formatDueDateInputValue,
  formatDueDateTimeStamp,
  formatTaskDueMetaLabel,
  getTaskDueDateUrgency,
} from "../../tasks/task-due-date.js";
import {
  TaskDueDateDropdown,
  type TaskDueDateDropdownProps,
} from "./task-due-date-dropdown.js";
import { TaskDueDateIcon } from "./task-due-date-icon.js";

function stopFieldEvent(event: SyntheticEvent) {
  event.stopPropagation();
}

/**
 * Mounts TaskDueDateDropdown only after first interaction so list rows do not
 * pay for SearchableDropdown + color-scheme subscriptions up front.
 *
 * The unmounted placeholder keeps the same root markers as the mounted
 * control (`data-task-property-dropdown`, `data-searchable-dropdown-root`) so
 * the ⇧D property hotkey and the dropdown tab chain can still find it.
 */
export function DeferredTaskDueDateDropdown(props: TaskDueDateDropdownProps) {
  const [mounted, setMounted] = useState(false);
  const [openPlacement, setOpenPlacement] =
    useState<SearchableDropdownOpenPlacement | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const ymdValue = formatDueDateInputValue(props.dueDate);
  const displayLabel = ymdValue
    ? props.labelFormat === "ymd-time"
      ? formatDueDateTimeStamp(props.dueDate) || ymdValue
      : props.labelFormat === "ymd"
        ? ymdValue
        : (formatTaskDueMetaLabel(ymdValue) ?? ymdValue)
    : (props.noDueDateLabel ?? "No due date");
  const hasDueDate = Boolean(ymdValue);
  const dueDateUrgency = useMemo(
    () =>
      getTaskDueDateUrgency(ymdValue || null, new Date(), {
        status: props.status ?? null,
      }),
    [props.status, ymdValue],
  );

  if (mounted) {
    return (
      <TaskDueDateDropdown
        {...props}
        defaultOpen
        defaultOpenPlacement={openPlacement ?? undefined}
      />
    );
  }

  const variant = props.variant ?? "property";
  const showIcon = props.showIcon !== false;
  const disabled = props.disabled ?? false;
  const resolvedTaskPropertyDropdownId =
    props.taskPropertyDropdownId === undefined
      ? "dueDate"
      : props.taskPropertyDropdownId;

  const mount = (event?: SyntheticEvent) => {
    if (event) {
      stopFieldEvent(event);
    }
    // Shortcut opens mark the root before clicking the trigger; the marked
    // element is replaced on mount, so carry the placement across in state.
    const placement = rootRef.current
      ? consumeSearchableDropdownOpenPlacement(rootRef.current, "anchored")
      : "anchored";
    if (placement === "center") {
      setOpenPlacement("center");
    }
    setMounted(true);
  };

  const wrapTrigger = (trigger: ReactNode) => (
    <div className="task-due-date-dropdown">
      <div
        ref={rootRef}
        data-searchable-dropdown-root=""
        data-task-property-dropdown={resolvedTaskPropertyDropdownId ?? undefined}
        className={[
          "searchable-dropdown-root",
          variant === "property"
            ? "property-dropdown"
            : "task-due-date-dropdown__searchable",
        ].join(" ")}
      >
        {trigger}
      </div>
    </div>
  );

  if (variant === "icon") {
    return wrapTrigger(
      <button
        type="button"
        title={displayLabel}
        className="task-item-row__icon-trigger"
        tabIndex={-1}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={false}
        aria-label={`Change due date: ${displayLabel}`}
        onMouseDown={stopFieldEvent}
        onClick={mount}
      >
        <TaskDueDateIcon
          size={14}
          active={hasDueDate}
          urgency={hasDueDate ? dueDateUrgency : null}
        />
      </button>,
    );
  }

  if (variant === "list") {
    return wrapTrigger(
      <button
        type="button"
        title={displayLabel}
        className={[
          "task-due-date-dropdown__list-trigger",
          hasDueDate ? "is-set" : "is-empty",
        ]
          .filter(Boolean)
          .join(" ")}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={false}
        aria-label={`Change due date: ${displayLabel}`}
        onMouseDown={stopFieldEvent}
        onClick={mount}
      >
        {showIcon ? (
          <TaskDueDateIcon
            size={14}
            active={hasDueDate}
            urgency={hasDueDate ? dueDateUrgency : null}
          />
        ) : null}
        <span className="task-due-date-dropdown__list-trigger-label">
          {displayLabel}
        </span>
      </button>,
    );
  }

  return wrapTrigger(
    <button
      type="button"
      className="property-dropdown-trigger"
      title={displayLabel}
      disabled={disabled}
      aria-haspopup="listbox"
      aria-expanded={false}
      aria-label={`Change due date: ${displayLabel}`}
      onClick={() => mount()}
    >
      {showIcon ? (
        <span className="property-dropdown-trigger__icon" aria-hidden="true">
          <TaskDueDateIcon
            active={hasDueDate}
            urgency={hasDueDate ? dueDateUrgency : null}
          />
        </span>
      ) : null}
      <span className="property-dropdown-trigger__label">{displayLabel}</span>
    </button>,
  );
}
