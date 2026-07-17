"use client";

import { useCallback, useMemo, useRef } from "react";

import { PropertyDropdown } from "@/components/ui/property-dropdown";
import type { SearchableDropdownMenuApi } from "@/components/ui/searchable-dropdown-menu-api";
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
  formatTaskDueMetaLabel,
  getTaskDueDateUrgency,
} from "@/lib/task-due-date";
import { openNativeDatePicker } from "@/lib/native-date-picker";

import { TaskDueDateIcon } from "./task-due-date-icon";

import type { TaskPropertyDropdownId } from "@/lib/shortcuts/task-property-dropdown-keys";

type ComposeDueDateDropdownProps = {
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  registerOpenMenu?: (api: SearchableDropdownMenuApi | null) => void;
  taskPropertyDropdownId?: TaskPropertyDropdownId;
  triggerVariant?: "default" | "composePill";
  emptyLabel?: string;
  ariaLabel?: string;
  searchPlaceholder?: string;
  searchShortcutLabel?: string;
  /** When false, skips due-date urgency coloring (e.g. received date). */
  showUrgency?: boolean;
};

export function ComposeDueDateDropdown({
  value,
  onChange,
  disabled = false,
  registerOpenMenu,
  taskPropertyDropdownId = "dueDate",
  triggerVariant = "default",
  emptyLabel = "No due date",
  ariaLabel = "Due date",
  searchPlaceholder = "tomorrow, next Friday…",
  searchShortcutLabel = "⇧D",
  showUrgency = true,
}: ComposeDueDateDropdownProps) {
  const dateInputRef = useRef<HTMLInputElement>(null);
  const ymdValue = value ?? "";
  const options = useMemo(
    () => buildTaskDueDateDropdownOptions(ymdValue || null),
    [ymdValue],
  );
  const selectedValue = taskDueDateDropdownValue(ymdValue || null);
  const displayLabel = ymdValue
    ? (formatTaskDueMetaLabel(ymdValue) ?? ymdValue)
    : emptyLabel;
  const hasDueDate = Boolean(ymdValue);
  const dueDateUrgency = useMemo(
    () =>
      showUrgency ? getTaskDueDateUrgency(ymdValue || null) : null,
    [showUrgency, ymdValue],
  );

  const handleChange = useCallback(
    (nextValue: string) => {
      if (isPickDueDateValue(nextValue)) {
        openNativeDatePicker(dateInputRef.current);
        return;
      }

      onChange(taskDueDateFromDropdownValue(nextValue));
    },
    [onChange],
  );

  const handleQuerySubmit = useCallback(
    (query: string) => {
      const result = parseNaturalLanguageDueDate(query);
      if (result.kind === "clear") {
        onChange(null);
        return true;
      }
      if (result.kind === "date") {
        onChange(result.ymd);
        return true;
      }
      return false;
    },
    [onChange],
  );

  const handleQueryPreview = useCallback(
    (query: string) => naturalLanguageDueDatePreview(query),
    [],
  );

  return (
    <>
      <PropertyDropdown
        value={selectedValue}
        options={options}
        onChange={handleChange}
        disabled={disabled}
        searchPlaceholder={searchPlaceholder}
        searchShortcutLabel={searchShortcutLabel}
        ariaLabel={ariaLabel}
        fallbackIcon={
          <TaskDueDateIcon active={hasDueDate} urgency={dueDateUrgency} />
        }
        fallbackLabel={displayLabel}
        mutedFallback={!hasDueDate}
        onQuerySubmit={handleQuerySubmit}
        queryPreviewLabel={handleQueryPreview}
        panelAlign="start"
        registerOpenMenu={registerOpenMenu}
        taskPropertyDropdownId={taskPropertyDropdownId}
        triggerVariant={triggerVariant}
      />
      <input
        ref={dateInputRef}
        type="date"
        value={ymdValue}
        onChange={(event) => {
          const next = event.target.value.trim();
          onChange(next ? next : null);
        }}
        className="fixed left-[-9999px] h-px w-px opacity-0"
        tabIndex={-1}
        aria-hidden="true"
      />
    </>
  );
}
